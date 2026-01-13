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
import {
  hasLocalClone,
  pullChanges,
  hasUncommittedChanges,
} from "../utils/git-utils";
import { join } from "path";
import { resolveRepositories, type RepoSelectionOptions } from "../utils/repo-selection";

interface PullOptions extends RepoSelectionOptions {
  verbose?: boolean;
}

async function pullRepository(
  repoFullName: string,
  branch: string,
  localRepoPath: string
): Promise<void> {
  try {
    debug(`Pulling changes for ${repoFullName}...`);

    // Check if repository has a local clone
    if (!(await hasLocalClone(localRepoPath))) {
      throw new Error(`Repository does not have a local clone at ${localRepoPath}`);
    }

    // Check for uncommitted changes before pulling
    if (await hasUncommittedChanges(localRepoPath)) {
      throw new Error(`Repository has uncommitted local changes. Commit or stash them before pulling.`);
    }

    // Pull the latest changes
    await pullChanges(localRepoPath);
    success(`Pulled latest changes for ${repoFullName}`);
  } catch (err) {
    throw new Error(
      `Failed to pull changes for ${repoFullName}: ${
        err instanceof Error ? err.message : "Unknown error"
      }`
    );
  }
}

export async function pullRepos(
  branch: string,
  options: PullOptions
): Promise<void> {
  setVerboseMode(options.verbose ?? false);

  try {
    const octokit = await getOctokit();
    const config = await loadConfig();

    if (!config.repositoriesPath) {
      error("repositoriesPath not configured. Set it in salve.config.json");
      process.exit(1);
    }

    const repoFullNames = await resolveRepositories(octokit, options);

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

        // Pull changes for the repository
        await pullRepository(repoFullName, branch, localRepoPath);
        successCount++;
      } catch (err) {
        error(
          `Failed to pull changes for ${repoFullName}: ${
            err instanceof Error ? err.message : "Unknown error"
          }`
        );
        errorCount++;
        failedRepos.push(repoFullName);
      }
    }

    if (repoFullNames.length > 1) {
      success(`Successfully pulled changes for ${successCount} repositories`);
      if (skipCount > 0) {
        info(`Skipped ${skipCount} repositories`);
      }
      if (errorCount > 0) {
        error(`Failed to pull changes for ${errorCount} repositories`);
        if (failedRepos.length > 0) {
          info(`Repositories with errors: ${failedRepos.join(", ")}`);
        }
      }
    }
  } catch (err) {
    error("Error: Failed to run pull command");
    if (err instanceof Error) {
      error(err.message);
    }
    process.exit(1);
  }
}
