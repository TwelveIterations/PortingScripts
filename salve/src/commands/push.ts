import chalk from "chalk";
import { loadConfig } from "../config";
import { join } from "path";
import { existsSync } from "fs";
import {
  error,
  success,
  info,
  warn,
  debug,
  setVerboseMode,
  promptUser,
} from "../utils/console";
import { findRepository } from "../utils/fuzzy-search";
import {
  getCommitsToPush,
  pushChanges,
} from "../utils/git-utils";

interface Options {
  verbose?: boolean;
}

async function promptForConfirmation(commits: string[]): Promise<boolean> {
  console.log();
  info(`Found ${chalk.cyan(commits.length)} commit(s) to push:`);
  console.log();
  
  commits.forEach((commit, index) => {
    const firstSpace = commit.indexOf(' ');
    const hash = commit.substring(0, firstSpace);
    const message = commit.substring(firstSpace + 1);
    console.log(`  ${chalk.gray(index + 1)}. ${chalk.yellow(hash)} ${message}`);
  });
  
  console.log();
  
  return await promptUser("Push these commits?");
}

export async function push(
  repo: string,
  branch: string,
  options: Options
): Promise<void> {
  setVerboseMode(options.verbose ?? false);

  const config = await loadConfig();

  if (!config.repositoriesPath) {
    error("repositoriesPath must be configured in salve.config.json");
    process.exit(1);
  }

  // Find repository in the specified branch
  const found = findRepository(repo, branch, config.repositoriesPath);
  if (!found) {
    error(`Repository '${repo}' not found in branch '${branch}'`);
    process.exit(1);
  }

  const repoPath = join(config.repositoriesPath, branch, found);
  if (!existsSync(repoPath)) {
    error(`Repository not found at: ${repoPath}`);
    process.exit(1);
  }

  debug(`Working with repository at ${chalk.cyan(repoPath)}`);

  // Get commits to push
  let commitsToPush: string[];
  try {
    commitsToPush = await getCommitsToPush(repoPath);
    debug(`Found ${commitsToPush.length} commits to push`);
  } catch (err) {
    error(`Failed to get commits to push: ${err}`);
    process.exit(1);
  }

  if (commitsToPush.length === 0) {
    info("No commits to push. Everything is up to date.");
    return;
  }

  // Show commits and ask for confirmation
  const shouldPush = await promptForConfirmation(commitsToPush);
  
  if (!shouldPush) {
    info("Push cancelled.");
    return;
  }

  // Push the changes
  info(`Pushing ${chalk.cyan(commitsToPush.length)} commit(s)...`);
  try {
    await pushChanges(repoPath);
    success(`Successfully pushed ${commitsToPush.length} commit(s)`);
  } catch (err) {
    error(`Failed to push changes: ${err}`);
    process.exit(1);
  }
}
