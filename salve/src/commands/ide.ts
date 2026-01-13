import { loadConfig } from '../config';
import { existsSync } from 'fs';
import { join } from 'path';
import launchEditor from 'launch-editor';
import { error, info } from '../utils/console';
import { findRepository } from '../utils/fuzzy-search';

export async function ide(repo: string, branch: string) {
  const config = await loadConfig();

  if (!config.repositoriesPath) {
    error('repositoriesPath is not configured. Please set it in the config file.');
    info('Run "salve config" to open the configuration file.');
    process.exit(1);
  }

  if (!config.ide) {
    error('IDE is not configured. Please set it in the config file.');
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
    // Open the project in the configured IDE
    const ideCommand = config.ide;
    info(`Opening repository '${matchedRepo}' in ${ideCommand}...`);
    
    launchEditor(repoPath, ideCommand, (fileName, errorMessage) => {
      error(`Error opening repository ${fileName} with ${ideCommand}: ${errorMessage}`);
      process.exit(1);
    });
  } catch (err) {
    error(`Failed to open repository: ${err}`);
    process.exit(1);
  }
}
