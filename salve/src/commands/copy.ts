import { getOctokit } from "../github";
import { loadConfig } from "../config";
import {
  error,
  success,
  debug,
  info,
  warn,
  setVerboseMode
} from "../utils/console";
import {
  hasLocalClone,
  pullChanges,
  getUncommittedChanges,
} from "../utils/git-utils";
import { existsSync, statSync } from "fs";
import { join, relative, resolve } from "path";
import { copyFile, mkdir } from "fs/promises";
import { resolveRepositories, type RepoSelectionOptions } from "../utils/repo-selection";

interface CopyOptions extends RepoSelectionOptions {
  branch: string;
  verbose?: boolean;
}

function findProjectRoot(filePath: string): string {
  let currentDir = resolve(filePath);
  
  // If the file path itself is a file, start from its directory
  if (existsSync(currentDir) && statSync(currentDir).isFile()) {
    currentDir = resolve(currentDir, "..");
  }
  
  while (currentDir !== "/") {
    if (existsSync(join(currentDir, ".git"))) {
      return currentDir;
    }
    const parentDir = resolve(currentDir, "..");
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }
  
  // If no .git directory found, return the original file's directory
  return resolve(filePath, "..");
}

export async function copyFileToRepos(sourcePath: string, options: CopyOptions): Promise<void> {
  setVerboseMode(options.verbose ?? false);
  
  try {
    // Validate source file exists
    if (!existsSync(sourcePath)) {
      error(`Source file not found: ${sourcePath}`);
      process.exit(1);
    }

    // Check if it's a file (not a directory)
    const sourceStat = statSync(sourcePath);
    if (!sourceStat.isFile()) {
      error(`Source path must be a file, not a directory: ${sourcePath}`);
      process.exit(1);
    }

    const octokit = await getOctokit();
    const config = await loadConfig();

    // Find project root and relativize the path
    const projectRoot = findProjectRoot(sourcePath);
    const relativeSourcePath = relative(projectRoot, sourcePath);
    debug(`Project root: ${projectRoot}`);
    debug(`Relative source path: ${relativeSourcePath}`);

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

        // Pull latest changes before copying
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
            `Cannot proceed with copy for ${repoFullName}. Please resolve the pull issue and try again.`
          );
          errorCount++;
          continue;
        }

        // Check for uncommitted changes only on the target file
        const targetPath = join(localRepoPath, relativeSourcePath);
        const uncommittedChanges = await getUncommittedChanges(localRepoPath);
        const targetFileHasChanges = uncommittedChanges
          .split('\n')
          .some(line => line.includes(relativeSourcePath));

        if (targetFileHasChanges) {
          error(
            `${repoFullName} has uncommitted local changes. Commit or stash them before copying.`
          );
          errorCount++;
          continue;
        }

        const targetDir = resolve(targetPath, "..");
        await mkdir(targetDir, { recursive: true });

        try {
          await copyFile(sourcePath, targetPath);
          success(`File copied to ${targetPath}`);
          successCount++;
        } catch (copyErr) {
          error(
            `Failed to copy file to ${repoFullName}: ${
              copyErr instanceof Error ? copyErr.message : "Unknown error"
            }`
          );
          errorCount++;
          failedRepos.push(repoFullName);
        }
      } catch (err) {
        error(
          `Failed to process copy for ${repoFullName}: ${
            err instanceof Error ? err.message : "Unknown error"
          }`
        );
        errorCount++;
      }
    }

    if (repoFullNames.length > 1) {
      success(`Successfully copied file to ${successCount} repositories`);
      if (errorCount > 0) {
        error(`Failed to copy file to ${errorCount} repositories`);
        if (failedRepos.length > 0) {
          info(`Repositories with errors: ${failedRepos.join(", ")}`);
        }
      }
    }
  } catch (err) {
    error("Error: Failed to run copy command");
    if (err instanceof Error) {
      error(err.message);
    }
    process.exit(1);
  }
}
