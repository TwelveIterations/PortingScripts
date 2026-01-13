import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import Fuse from 'fuse.js';

export interface FuzzySearchOptions {
  threshold?: number;
  scoreThreshold?: number;
}

export function fuzzySearch(
  pattern: string,
  items: string[],
  options: FuzzySearchOptions = {}
): string | null {
  const { threshold = 0.3, scoreThreshold = 0.4 } = options;

  // If exact match, return it
  const exactMatch = items.find(item => item === pattern);
  if (exactMatch) {
    return exactMatch;
  }

  // Use fuzzy search for partial matches
  const fuse = new Fuse(items, {
    keys: ['name'],
    threshold,
    includeScore: true
  });

  const results = fuse.search(pattern);
  if (results.length > 0) {
    const bestMatch = results[0];
    if (bestMatch && bestMatch.score !== undefined && bestMatch.score < scoreThreshold) {
      return bestMatch.item;
    }
  }

  return null;
}

export function findRepository(
  repoPattern: string,
  branch: string,
  repositoriesPath: string,
  options: FuzzySearchOptions = {}
): string | null {
  const branchPath = join(repositoriesPath, branch);
  if (!existsSync(branchPath)) {
    return null;
  }

  const repositories = readdirSync(branchPath, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  return fuzzySearch(repoPattern, repositories, options);
}
