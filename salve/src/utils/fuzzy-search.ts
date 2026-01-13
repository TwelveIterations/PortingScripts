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

  // Check for exact match first
  const exactMatch = repositories.find(repo => repo === repoPattern);
  if (exactMatch) {
    return exactMatch;
  }

  // Check for initials match (e.g., "CraSlo" -> "CraftingSlots")
  const initialsMatch = findRepositoryByInitials(repoPattern, repositories);
  if (initialsMatch) {
    return initialsMatch;
  }

  // Use fuzzy search for partial matches
  return fuzzySearch(repoPattern, repositories, options);
}

export function findRepositoryByInitials(initials: string, repositories: string[]): string | null {
  // Check if the pattern looks like initials (alternating case or all uppercase)
  if (!isInitialsPattern(initials)) {
    return null;
  }

  // First try camelCase pattern matching (for patterns like "CliTwe")
  const camelCaseMatch = findRepositoryByCamelCasePattern(initials, repositories);
  if (camelCaseMatch) {
    return camelCaseMatch;
  }

  // Fall back to traditional initials matching
  const matches: string[] = [];
  
  for (const repo of repositories) {
    if (matchesInitials(initials, repo)) {
      matches.push(repo);
    }
  }

  if (matches.length === 0) {
    return null;
  }

  if (matches.length === 1) {
    return matches[0] || null;
  }

  // Multiple initials matches - return the first one (traditional behavior)
  return matches[0] || null;
}

export function findRepositoryByCamelCasePattern(pattern: string, repositories: string[]): string | null {
  // Only apply this to patterns that have clear camelCase boundaries (like "CliTwe")
  if (!hasCamelCaseBoundaries(pattern)) {
    return null;
  }

  for (const repo of repositories) {
    if (matchesCamelCasePattern(pattern, repo)) {
      return repo;
    }
  }

  return null;
}

function hasCamelCaseBoundaries(pattern: string): boolean {
  // Check if pattern has uppercase letters that indicate word boundaries
  let uppercaseCount = 0;
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char && /[a-zA-Z]/.test(char) && char === char.toUpperCase() && char !== char.toLowerCase()) {
      uppercaseCount++;
    }
  }
  return uppercaseCount >= 2; // At least 2 uppercase letters for clear boundaries
}

function matchesCamelCasePattern(pattern: string, repository: string): boolean {
  // Extract the pattern segments from the camelCase pattern
  const patternSegments = extractCamelCaseSegments(pattern);
  if (patternSegments.length === 0) {
    return false;
  }

  // Extract repository segments
  const repoSegments = extractCamelCaseSegments(repository);
  if (repoSegments.length === 0) {
    return false;
  }

  // Check if each pattern segment matches the beginning of corresponding repo segments
  if (patternSegments.length > repoSegments.length) {
    return false;
  }

  for (let i = 0; i < patternSegments.length; i++) {
    const patternSeg = patternSegments[i];
    const repoSeg = repoSegments[i];
    
    if (!patternSeg || !repoSeg || !repoSeg.toLowerCase().startsWith(patternSeg.toLowerCase())) {
      return false;
    }
  }

  return true;
}

function extractCamelCaseSegments(name: string): string[] {
  const segments: string[] = [];
  let currentSegment = '';
  
  for (let i = 0; i < name.length; i++) {
    const char = name[i];
    
    if (!char) continue;
    
    // If we hit an uppercase letter (and it's not the first character), start a new segment
    if (char === char.toUpperCase() && char !== char.toLowerCase() && currentSegment.length > 0) {
      segments.push(currentSegment);
      currentSegment = char;
    } else {
      currentSegment += char;
    }
  }
  
  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }
  
  return segments;
}

function isInitialsPattern(pattern: string): boolean {
  // Check if pattern has alternating case or is all uppercase/lowercase
  // and has at least 2 characters
  if (pattern.length < 2) {
    return false;
  }

  // Check for alternating case pattern (e.g., CraSlo)
  // This pattern has uppercase letters that indicate word boundaries
  let hasAlternatingCase = false;
  let uppercaseCount = 0;
  let letterCount = 0;
  
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char && /[a-zA-Z]/.test(char)) { // It's a letter
      letterCount++;
      if (char === char.toUpperCase()) {
        uppercaseCount++;
        if (i > 0) {
          const prevChar = pattern[i - 1];
          if (prevChar && prevChar === prevChar.toLowerCase() && prevChar !== prevChar.toUpperCase()) {
            hasAlternatingCase = true;
          }
        }
      }
    }
  }

  // Check if all uppercase (2+ uppercase letters)
  const isAllUppercase = uppercaseCount >= 2 && pattern === pattern.toUpperCase();
  
  // Check if all lowercase (2+ lowercase letters) - treat as initials
  const isAllLowercase = letterCount >= 2 && pattern === pattern.toLowerCase();
  
  // Check if mixed case with 2+ letters (like "Cs") - treat as initials
  const isMixedCase = letterCount >= 2 && !isAllUppercase && !isAllLowercase && uppercaseCount >= 1;

  return hasAlternatingCase || isAllUppercase || isAllLowercase || isMixedCase;
}

function matchesInitials(initials: string, repository: string): boolean {
  // Extract initials from repository name
  const repoInitials = extractInitials(repository);
  
  // Check if the pattern matches the extracted initials
  if (repoInitials.toLowerCase() === initials.toLowerCase()) {
    return true;
  }
  
  // For patterns like "CraSlo", extract the uppercase letters and compare
  const patternInitials = extractPatternInitials(initials);
  return repoInitials.toLowerCase() === patternInitials.toLowerCase();
}

function extractPatternInitials(pattern: string): string {
  // Extract uppercase letters from pattern like "CraSlo" -> "CS"
  let initials = '';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char && char === char.toUpperCase() && char !== char.toLowerCase()) {
      initials += char;
    }
  }
  return initials;
}

function extractInitials(name: string): string {
  // Extract initials from camelCase or PascalCase names
  // e.g., "CraftingSlots" -> "CS", "MyAwesomeRepo" -> "MAR"
  
  let initials = '';
  let previousCharWasLowercase = false;
  
  for (let i = 0; i < name.length; i++) {
    const char = name[i];
    
    if (!char) continue;
    
    // Add uppercase letter that follows a lowercase letter or is at the start
    if (char === char.toUpperCase() && char !== char.toLowerCase()) {
      if (i === 0 || previousCharWasLowercase) {
        initials += char;
      }
    }
    
    previousCharWasLowercase = char === char.toLowerCase() && char !== char.toUpperCase();
  }
  
  return initials;
}
