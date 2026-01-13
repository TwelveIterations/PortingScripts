import { Octokit } from "octokit";
import { getOctokit } from "../github";
import { loadConfig } from "../config";
import {
  error,
  success,
  debug,
  info,
  warn
} from "../utils/console";
import {
  hasLocalClone,
  pullChanges,
  getUncommittedChanges,
} from "../utils/git-utils";
import { existsSync, statSync } from "fs";
import { join, relative, resolve } from "path";
import { copyFile, mkdir } from "fs/promises";

interface CopyOptions {
  repo?: string;
  org?: string;
  team?: string;
  pattern?: string;
  branch: string;
}

async function getRepositoriesForCopy(
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

    const organization = options.org || config.organization;
    if (!organization) {
      error(
        "Organization not specified. Use --org or set it in salve.config.json"
      );
      process.exit(1);
    }

    const team = options.team || config.team;

    // Find project root and relativize the path
    const projectRoot = findProjectRoot(sourcePath);
    const relativeSourcePath = relative(projectRoot, sourcePath);
    debug(`Project root: ${projectRoot}`);
    debug(`Relative source path: ${relativeSourcePath}`);

    let repoFullNames: string[];
    if (!options.repo) {
      repoFullNames = await getRepositoriesForCopy(
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
