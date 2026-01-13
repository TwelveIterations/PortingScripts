import { Octokit } from "octokit";
import { getOctokit } from "../github";
import { loadConfig } from "../config";
import {
  error,
  success,
  debug,
  info,
  warn,
  promptUser,
} from "../utils/console";
import {
  hasLocalClone,
  pullChanges,
  hasUncommittedChanges,
  applyPatch,
} from "../utils/git-utils";
import { existsSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import launchEditor from "launch-editor";

interface PatchOptions {
  repo?: string;
  org?: string;
  team?: string;
  pattern?: string;
  branch: string;
}

async function getRepositoriesForPatch(
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

async function promptForPatchApplication(
  repoFullName: string,
  localRepoPath: string,
  patchFilePath: string,
  warnings: string[] = []
): Promise<boolean> {
  console.log();
  console.log(chalk.underline(repoFullName));
  console.log();
  console.log(chalk.bold(`Patch file:`));
  console.log(patchFilePath);

  for (const warning of warnings) {
    warn(warning);
  }

  const proceed = await promptUser(
    warnings.length > 0
      ? `Apply patch to ${repoFullName} anyways?`
      : `Apply patch to ${repoFullName}?`,
    false
  );

  if (!proceed) {
    debug(`Skipping ${repoFullName}`);
  }

  return proceed;
}

export async function patch(patch: string, options: PatchOptions): Promise<void> {
  try {
    // Validate patch file exists
    if (!existsSync(patch)) {
      error(`Patch file not found: ${patch}`);
      process.exit(1);
    }

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
      repoFullNames = await getRepositoriesForPatch(
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
    let failedRepos: string[] = [];

    for (const repoFullName of repoFullNames) {
      try {
        debug(`Processing ${repoFullName}...`);

        const [owner, repoName] = repoFullName.split("/");
        if (!owner || !repoName) {
          error(`Invalid repository format: ${repoFullName}`);
          errorCount++;
          continue;
        }

        const localRepoPath = join(
          config.repositoriesPath!,
          options.branch,
          repoName
        );

        // Check if repository has a local clone
        if (!(await hasLocalClone(localRepoPath))) {
          warn(
            `Repository ${repoFullName} does not have a local clone at ${localRepoPath}. Skipping.`
          );
          continue;
        }

        // Pull latest changes before applying patch
        try {
          debug(`Pulling latest changes for ${repoFullName}...`);
          await pullChanges(localRepoPath);
          debug(`Pulled latest changes for ${repoFullName}`);
        } catch (err) {
          error(
            `Failed to pull changes for ${repoFullName}: ${
              err instanceof Error ? err.message : "Unknown error"
            }`
          );
          error(
            `Cannot proceed with patch application for ${repoFullName}. Please resolve the pull issue and try again.`
          );
          errorCount++;
          continue;
        }

        if (await hasUncommittedChanges(localRepoPath)) {
          error(
            `${repoFullName} has uncommitted local changes. Commit or stash them before applying patch.`
          );
          errorCount++;
          continue;
        }

        // Apply the patch
        const patchResult = await applyPatch(localRepoPath, patch);

        if (patchResult.success) {
          success(`Patch applied successfully to ${repoFullName}`);
          if (patchResult.output) {
            debug(patchResult.output);
          }
          successCount++;
        } else {
          error(
            `Failed to apply patch to ${repoFullName}: ${patchResult.error}`
          );
          failedRepos.push(repoFullName);

          // Prompt to open IDE
          const openIDEPrompt = await promptUser(
            `Would you like to open the project in IDE to resolve conflicts?`,
            false
          );

          if (openIDEPrompt) {
            launchEditor(
              localRepoPath,
              config.ide,
              (_fileName, errorMessage) => {
                error(
                  `Failed to open project with ${config.ide}: ${errorMessage}`
                );
              }
            );
          }
          errorCount++;
        }
      } catch (err) {
        error(
          `Failed to process patch for ${repoFullName}: ${
            err instanceof Error ? err.message : "Unknown error"
          }`
        );
        errorCount++;
      }
    }

    if (repoFullNames.length > 1) {
      success(`Successfully applied patch to ${successCount} repositories`);
      if (errorCount > 0) {
        error(`Failed to apply patch to ${errorCount} repositories`);
        if (failedRepos.length > 0) {
          info(`Repositories with conflicts: ${failedRepos.join(", ")}`);
        }
      }
    }
  } catch (err) {
    error("Error: Failed to run patch command");
    if (err instanceof Error) {
      error(err.message);
    }
    process.exit(1);
  }
}
