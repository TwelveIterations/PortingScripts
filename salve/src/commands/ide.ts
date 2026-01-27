import { loadConfig } from '../config';
import { existsSync } from 'fs';
import { join } from 'path';
import { launchIde } from '../utils/launch-ide';
import { error, info } from '../utils/console';
import { findRepository } from '../utils/fuzzy-search';

export async function ide(repo: string, branch: string) {
  const config = await loadConfig();

  if (!config.repositoriesPath) {
    error('repositoriesPath is not configured. Please set it in the config file.');
    info('Run "salve config" to open the configuration file.');
    process.exit(1);
  }

  const matchedRepo = findRepository(repo, branch, config.repositoriesPath);
  if (!matchedRepo) {
    error(`Repository '${repo}' not found in branch '${branch}'`);
    process.exit(1);
  }

  const repoPath = join(config.repositoriesPath, branch, matchedRepo);
  if (!existsSync(repoPath)) {
    error(`Repository '${matchedRepo}' not found at ${repoPath}`);
    process.exit(1);
  }

  try {
    await launchIde(repoPath);
  } catch (err) {
    error(`Failed to open repository: ${err}`);
    process.exit(1);
  }
}
