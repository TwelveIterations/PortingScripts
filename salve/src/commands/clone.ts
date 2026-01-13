import { Octokit } from "octokit";
import { getOctokit } from "../github";
import { loadConfig } from "../config";
import {
  error,
  success,
  debug,
  info,
  warn,
  setVerboseMode,
} from "../utils/console";
import { existsSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { mkdir } from "fs/promises";
import { $ } from "bun";
import { hasUncommittedChanges, getCommitsToPush } from "../utils/git-utils";

interface CloneOptions {
  repo?: string;
  org?: string;
  team?: string;
  pattern?: string;
  verbose?: boolean;
}

async function getRepositoriesForClone(
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

async function safeCleanupDirectory(
  targetPath: string,
  repoFullName: string
): Promise<void> {
  try {
    // Check if it's a git repository
    if (existsSync(join(targetPath, ".git"))) {
      // Check for uncommitted changes
      const hasUncommitted = await hasUncommittedChanges(targetPath);
      if (hasUncommitted) {
        warn(`Not cleaning up ${repoFullName} - has uncommitted changes`);
        return;
      }

      // Check for unpushed commits
      const commitsToPush = await getCommitsToPush(targetPath);
      if (commitsToPush.length > 0) {
        warn(
          `Not cleaning up ${repoFullName} - has ${commitsToPush.length} unpushed commits`
        );
        return;
      }
    }

    // Safe to remove
    debug(`Cleaning up directory: ${targetPath}`);
    rmSync(targetPath, { recursive: true, force: true });
  } catch (cleanupErr) {
    warn(
      `Failed to cleanup directory ${targetPath}: ${
        cleanupErr instanceof Error ? cleanupErr.message : "Unknown error"
      }`
    );
  }
}

async function cloneRepository(
  repoFullName: string,
  branch: string,
  targetPath: string
): Promise<void> {
  try {
    debug(`Cloning ${repoFullName} to ${targetPath}...`);

    // Create the target directory if it doesn't exist
    await mkdir(targetPath, { recursive: true });

    // Clone the repository
    try {
      const gitUrl = `git@github.com:${repoFullName}.git`;
      await $`git clone ${gitUrl} ${targetPath}`;
    } catch (cloneErr) {
      const cloneOutput =
        cloneErr instanceof Error ? cloneErr.message : "Unknown error";
      throw new Error(`git clone failed: ${cloneOutput}`);
    }

    // Checkout the specified branch
    debug(`Checking out branch ${branch} in ${repoFullName}...`);
    try {
      await $`git -C ${targetPath} checkout ${branch}`;
    } catch (checkoutErr) {
      const checkoutOutput =
        checkoutErr instanceof Error ? checkoutErr.message : "Unknown error";

      // Clean up the directory if checkout failed
      warn(`Checkout failed for ${repoFullName}, cleaning up directory`);
      await safeCleanupDirectory(targetPath, repoFullName);

      throw new Error(`git checkout failed: ${checkoutOutput}`);
    }

    success(`Cloned ${repoFullName} and checked out branch ${branch}`);
  } catch (err) {
    throw new Error(
      `Failed to clone ${repoFullName}: ${
        err instanceof Error ? err.message : "Unknown error"
      }`
    );
  }
}

export async function cloneRepos(
  branch: string,
  options: CloneOptions
): Promise<void> {
  setVerboseMode(options.verbose ?? false);

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

    if (!config.repositoriesPath) {
      error("repositoriesPath not configured. Set it in salve.config.json");
      process.exit(1);
    }

    const team = options.team || config.team;

    let repoFullNames: string[];
    if (!options.repo) {
      repoFullNames = await getRepositoriesForClone(
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
    let skipCount = 0;
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

        const localRepoPath = join(config.repositoriesPath, branch, repoName);

        // Check if the folder already exists
        if (existsSync(localRepoPath)) {
          // Check if the folder is empty
          const files = readdirSync(localRepoPath);
          if (files.length === 0) {
            debug(
              `Repository ${repoFullName} folder exists but is empty, removing and proceeding with clone`
            );
            rmSync(localRepoPath, { recursive: true });
          } else {
            if (options.repo) {
              warn(
                `Repository ${repoFullName} already exists at ${localRepoPath}. Skipping.`
              );
            }
            skipCount++;
            continue;
          }
        }

        // Clone the repository and checkout the branch
        await cloneRepository(repoFullName, branch, localRepoPath);
        successCount++;
      } catch (err) {
        error(
          `Failed to process clone for ${repoFullName}: ${
            err instanceof Error ? err.message : "Unknown error"
          }`
        );
        errorCount++;
        failedRepos.push(repoFullName);
      }
    }

    if (repoFullNames.length > 1) {
      success(`Successfully cloned ${successCount} repositories`);
      if (skipCount > 0) {
        info(`Skipped ${skipCount} repositories (already exist)`);
      }
      if (errorCount > 0) {
        error(`Failed to clone ${errorCount} repositories`);
        if (failedRepos.length > 0) {
          info(`Repositories with errors: ${failedRepos.join(", ")}`);
        }
      }
    }
  } catch (err) {
    error("Error: Failed to run clone command");
    if (err instanceof Error) {
      error(err.message);
    }
    process.exit(1);
  }
}
