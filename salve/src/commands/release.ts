import { Octokit } from "octokit";
import { getOctokit } from "../github";
import { loadConfig } from "../config";
import { error, success, debug, info, warn, promptUser } from "../utils/console";
import { getLastCommitMessage, getCommitsSinceVersionTag, hasUncommittedChanges, getCommitsToPush, getCommitLog, pullChanges, hasLocalClone } from "../utils/git-utils";
import { parseCommitMessage } from "../utils/changelog-utils";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import chalk from "chalk";

interface ReleaseOptions {
  loader?: string;
  repo?: string;
  org?: string;
  team?: string;
  pattern?: string;
  dry?: boolean;
  force?: boolean;
  branch: string;
}

interface LoaderConfig {
  fabric: boolean;
  neoforge: boolean;
  forge: boolean;
}

async function getCommitsWithHashes(repoPath: string, filterMetaCommits: boolean = false): Promise<{ hash: string; message: string }[]> {
  try {
    const result = await getCommitLog(repoPath);
    const lines = result.split('\n').filter(l => l.length > 0);
    
    const commits: { hash: string; message: string }[] = [];
    
    for (const line of lines) {
      const spaceIdx = line.indexOf(' ');
      if (spaceIdx === -1) continue;
      
      const hash = line.substring(0, spaceIdx);
      const message = line.substring(spaceIdx + 1);
      
      // Stop at version commit
      if (message.includes('Set version to')) {
        break;
      }
      
      if (filterMetaCommits) {
        const parsed = parseCommitMessage(message);
        if (parsed.isMetaCommit) {
          continue;
        }
      }
      
      commits.push({ hash: hash.substring(0, 7), message });
    }
    
    return commits;
  } catch (err) {
    return [];
  }
}

async function promptForRelease(
  repoFullName: string,
  localRepoPath: string,
  warnings: string[] = []
): Promise<boolean> {
  const changelogPath = join(localRepoPath, "CHANGELOG.md");
  if (!existsSync(changelogPath)) {
    error(`No CHANGELOG.md file found for ${repoFullName}. Cannot proceed with release.`);
    return false;
  }
  
  const changelog = readFileSync(changelogPath, "utf8");
  const commitsWithHashes = await getCommitsWithHashes(localRepoPath);
  
  console.log()
  console.log(chalk.underline(repoFullName))
  console.log()
  console.log(chalk.bold(`Release Changelog:`));
  console.log(changelog);
  
  console.log(chalk.bold(`Included Commits:`));
  commitsWithHashes.forEach(commit => {
    console.log(`> ${commit.hash} ${commit.message}`);
  });
  console.log()

  for (const warning of warnings) {
    warn(warning);
  }

  const proceed = await promptUser(
    warnings.length > 0 ? `Release ${repoFullName} anyways?` : `Ready to release ${repoFullName}?`,
    warnings.length === 0
  );
  
  if (!proceed) {
    debug(`Skipping ${repoFullName}`);
  }
  
  return proceed;
}

async function lookupSupportedLoaders(
  repoName: string,
  branch: string
): Promise<LoaderConfig> {
  const configData = await loadConfig();

  if (!configData.repositoriesPath) {
    error("repositoriesPath not configured in salve.config.json");
    process.exit(1);
  }

  const localRepoPath = join(configData.repositoriesPath, branch, repoName);
  const gradlePropertiesPath = join(localRepoPath, "gradle.properties");
  if (!existsSync(gradlePropertiesPath)) {
    error(`gradle.properties not found at ${gradlePropertiesPath}`);
    process.exit(1);
  }

  const content = readFileSync(gradlePropertiesPath, "utf8");
  return parseGradleProperties(content);
}

function parseGradleProperties(content: string): LoaderConfig {
  const config: LoaderConfig = {
    fabric: false,
    neoforge: false,
    forge: false,
  };

  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || trimmed === "") continue;

    const match = trimmed.match(/^([^=]+)\s*=\s*(.+)$/);
    if (match && match[1] && match[2]) {
      const key = match[1].trim();
      const value = match[2].trim();

      if (key === "include_fabric" && value === "true") config.fabric = true;
      else if (key === "include_neoforge" && value === "true")
        config.neoforge = true;
      else if (key === "include_forge" && value === "true") config.forge = true;
    }
  }

  return config;
}

async function getRepositoriesForRelease(
  octokit: Octokit,
  organization: string,
  team?: string,
  pattern?: string
): Promise<string[]> {
  try {
    let repos: { full_name: string }[];

    if (team) {
      debug(
        `Fetching repositories for team: ${team} in organization: ${organization}`
      );
      repos = await octokit.paginate(octokit.rest.teams.listReposInOrg, {
        org: organization,
        team_slug: team,
        per_page: 100,
      });
    } else {
      debug(`Fetching repositories for organization: ${organization}`);
      repos = await octokit.paginate(octokit.rest.repos.listForOrg, {
        org: organization,
        per_page: 100,
      });
    }

    let repoNames = repos.map((r) => r.full_name);

    // Load config for excluded repositories
    const config = await loadConfig();
    if (config.excludedRepositories.length > 0) {
      const excluded = new Set(config.excludedRepositories);
      const beforeCount = repoNames.length;
      repoNames = repoNames.filter((name) => !excluded.has(name));
      const excludedCount = beforeCount - repoNames.length;
      if (excludedCount > 0) {
        debug(`Excluded ${excludedCount} repositories from config`);
      }
    }

    if (pattern) {
      debug(`Filtering repositories by pattern: ${pattern}`);
      const regex = new RegExp(pattern);
      repoNames = repoNames.filter((name) => regex.test(name));
    }

    return repoNames;
  } catch (err) {
    error(
      `Failed to fetch repositories for ${
        team ? `team '${team}' in ` : ""
      }organization '${organization}'`
    );
    process.exit(1);
  }
}

async function resolveLoaderConfig(
  repoName: string,
  branch: string,
  loader?: string
): Promise<LoaderConfig> {
  if (loader) {
    const normalizedLoader = loader.toLowerCase().trim();
    const loaderConfig: LoaderConfig = {
      fabric: normalizedLoader === "fabric",
      neoforge: normalizedLoader === "neoforge",
      forge: normalizedLoader === "forge",
    };

    if (!loaderConfig.fabric && !loaderConfig.neoforge && !loaderConfig.forge) {
      error(
        `Invalid loader: ${loader}. Must be one of 'fabric', 'neoforge' or 'forge'`
      );
      process.exit(1);
    }

    return loaderConfig;
  }

  return await lookupSupportedLoaders(repoName, branch);
}

export async function release(options: ReleaseOptions): Promise<void> {
  try {
    const octokit = await getOctokit();
    const config = await loadConfig();

    const organization = options.org || config.organization;
    if (!organization) {
      error(
        "Organization not specified. Use --org or set it in salve.config.json"
      );
      process.exit(1);
    }

    const team = options.team || config.team;

    let repoFullNames: string[];
    if (!options.repo) {
      repoFullNames = await getRepositoriesForRelease(
        octokit,
        organization,
        team,
        options.pattern
      );
      debug(`Found ${repoFullNames.length} repositories to process`);
    } else {
      repoFullNames = [`${organization}/${options.repo}`];
    }

    let successCount = 0;
    let errorCount = 0;

    for (const repoFullName of repoFullNames) {
      try {
        debug(`Processing ${repoFullName}...`);

        const [owner, repoName] = repoFullName.split("/");
        if (!owner || !repoName) {
          error(`Invalid repository format: ${repoFullName}`);
          errorCount++;
          continue;
        }

        const localRepoPath = join(config.repositoriesPath!, options.branch, repoName);

        // Check if repository has a local clone
        if (!(await hasLocalClone(localRepoPath))) {
          warn(`Repository ${repoFullName} does not have a local clone at ${localRepoPath}. Skipping.`);
          continue;
        }

        // Pull latest changes before considering release
        try {
          debug(`Pulling latest changes for ${repoFullName}...`);
          await pullChanges(localRepoPath);
          debug(`Pulled latest changes for ${repoFullName}`);
        } catch (err) {
          error(`Failed to pull changes for ${repoFullName}: ${err instanceof Error ? err.message : 'Unknown error'}`);
          error(`Cannot proceed with release for ${repoFullName}. Please resolve the pull issue and try again.`);
          errorCount++;
          continue;
        }

        if (await hasUncommittedChanges(localRepoPath)) {
          error(`${repoFullName} has uncommitted local changes. Commit or stash them before releasing.`);
          errorCount++;
          continue;
        }

        const unpushedCommits = await getCommitsToPush(localRepoPath);
        if (unpushedCommits.length > 0) {
          error(`${repoFullName} has ${unpushedCommits.length} unpushed commit(s). Push them before releasing.`);
          errorCount++;
          continue;
        }

        if (!options.force) {
          const meaningfulCommits = await getCommitsWithHashes(localRepoPath, true);
          if (meaningfulCommits.length === 0) {
            // Only log an error if the repo was explicitly specified
            if (options.repo) {
                error(`No meaningful commits since last version commit for ${repoFullName}. Skipping.`);
                errorCount++;
            }
            continue;
          }

          const lastCommit = await getLastCommitMessage(localRepoPath);
          if (lastCommit !== "chore: Update changelog") {
            const proceed = await promptForRelease(repoFullName, localRepoPath, [`The changelog might be outdated! Last commit: ${lastCommit}`]);
            if (!proceed) {
              errorCount++;
              continue;
            }
          } else {
            const proceed = await promptForRelease(repoFullName, localRepoPath);
            if (!proceed) {
              errorCount++;
              continue;
            }
          }
        }

        const loaderConfig = await resolveLoaderConfig(
          repoName,
          options.branch,
          options.loader
        );
        if (!loaderConfig.fabric && !loaderConfig.neoforge && !loaderConfig.forge) {
          error(`No supported loader found for ${repoFullName}`);
          errorCount++;
          continue;
        }

        debug(
          `Loaders for ${repoFullName}: Fabric=${loaderConfig.fabric}, NeoForge=${loaderConfig.neoforge}, Forge=${loaderConfig.forge}`
        );

        if (options.dry) {
          info(`[DRY RUN] Would trigger workflow for ${repoFullName}...`);
        } else {
          await triggerWorkflow(
            octokit,
            owner,
            repoName,
            options.branch,
            loaderConfig
          );
        }
        successCount++;
      } catch (err) {
        error(
          `Failed to trigger workflow for ${repoFullName}: ${
            err instanceof Error ? err.message : "Unknown error"
          }`
        );
        errorCount++;
      }
    }

    if (repoFullNames.length > 1) {
      success(`Successfully initiated release for ${successCount} repositories`);
      if (errorCount > 0) {
        error(`Failed to initiate release for ${errorCount} repositories`);
      }
    }
  } catch (err) {
    error("Error: Failed to run workflow");
    if (err instanceof Error) {
      error(err.message);
    }
    process.exit(1);
  }
}

async function triggerWorkflow(
  octokit: Octokit,
  repoOwner: string,
  repoName: string,
  version: string,
  loaderConfig: LoaderConfig
) {
  info(`Triggering workflow for ${repoOwner}/${repoName}...`);

  const response = await octokit.rest.actions.createWorkflowDispatch({
    owner: repoOwner,
    repo: repoName,
    workflow_id: "publish-release.yml",
    ref: version,
    inputs: {
      forge: loaderConfig.forge.toString(),
      fabric: loaderConfig.fabric.toString(),
      neoforge: loaderConfig.neoforge.toString(),
    },
  });

  if (response.status === 204) {
    success(
      `Release workflow triggered successfully for ${repoOwner}/${repoName}!`
    );
    info(
      `You can check the workflow status at: https://github.com/${repoOwner}/${repoName}/actions`
    );
  } else {
    error("Failed to trigger workflow");
    error(`Response status: ${response.status}`);
    process.exit(1);
  }
}
