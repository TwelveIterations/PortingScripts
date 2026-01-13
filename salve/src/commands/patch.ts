import { getOctokit } from "../github";
import { loadConfig } from "../config";
import {
  error,
  success,
  debug,
  info,
  warn,
  promptUser,
  setVerboseMode,
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
import { resolveRepositories, type RepoSelectionOptions } from "../utils/repo-selection";

interface PatchOptions extends RepoSelectionOptions {
  branch: string;
  verbose?: boolean;
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
  setVerboseMode(options.verbose ?? false);

  try {
    // Validate patch file exists
    if (!existsSync(patch)) {
      error(`Patch file not found: ${patch}`);
      process.exit(1);
    }

    const octokit = await getOctokit();
    const config = await loadConfig();

    const repoFullNames = await resolveRepositories(octokit, options);

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
