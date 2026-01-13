import { loadConfig } from '../config';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import launchEditor from 'launch-editor';
import { error, info } from '../utils/console';
import Fuse from 'fuse.js';

function findRepository(repoPattern: string, branch: string, repositoriesPath: string): string | null {
  const branchPath = join(repositoriesPath, branch);
  if (!existsSync(branchPath)) {
    return null;
  }

  const repositories = readdirSync(branchPath, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  // If exact match, return it
  const exactMatch = repositories.find(repo => repo === repoPattern);
  if (exactMatch) {
    return exactMatch;
  }

  // Use fuzzy search for partial matches
  const fuse = new Fuse(repositories, {
    keys: ['name'],
    threshold: 0.3, // Lower threshold = more strict matching
    includeScore: true
  });

  const results = fuse.search(repoPattern);
  if (results.length > 0) {
    const bestMatch = results[0];
    if (bestMatch && bestMatch.score !== undefined && bestMatch.score < 0.4) {
      return bestMatch.item;
    }
  }

  return null;
}

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
