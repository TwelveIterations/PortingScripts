export interface Commit {
  hash: string;
  message: string;
}

interface GroupedChanges {
  added: string[];
  fixed: string[];
  changed: string[];
  removed: string[];
}

export function parseCommitMessage(message: string): { type: string; description: string; isMetaCommit: boolean } {
  const metaPrefixes = ['build', 'ci', 'chore'];
  
  // Check for conventional commit format: type(scope): description or type: description
  const conventionalMatch = message.match(/^(\w+)(?:\([^)]*\))?:\s*(.+)$/);
  
  if (conventionalMatch) {
    const type = conventionalMatch[1]!.toLowerCase();
    const description = conventionalMatch[2]!;
    const isMetaCommit = metaPrefixes.includes(type);
    
    return { type, description, isMetaCommit };
  }
  
  // Check for simple prefix format: Add/Fix/Remove/Change/Update something
  const simplePrefixMatch = message.match(/^(Add|Fix|Remove|Change|Update)\s+(.+)$/i);
  
  if (simplePrefixMatch) {
    const prefix = simplePrefixMatch[1]!.toLowerCase();
    const description = simplePrefixMatch[2]!;
    
    return { type: prefix, description, isMetaCommit: false };
  }
  
  // Default to "changed" for unrecognized formats
  return { type: 'change', description: message, isMetaCommit: false };
}

export function categorizeCommit(type: string): keyof GroupedChanges {
  const typeMap: Record<string, keyof GroupedChanges> = {
    'add': 'added',
    'feat': 'added',
    'feature': 'added',
    'fix': 'fixed',
    'remove': 'removed',
    'delete': 'removed',
    'change': 'changed',
    'update': 'changed',
    'refactor': 'changed',
    'perf': 'changed',
    'style': 'changed',
    'docs': 'changed',
    'test': 'changed',
  };
  
  return typeMap[type] || 'changed';
}

export function formatDescription(description: string): string {
  // Change prefixes to past tense
  const prefixMap: Record<string, string> = {
    'Add ': 'Added ',
    'Fix ': 'Fixed ',
    'Remove ': 'Removed ',
    'Change ': 'Changed ',
    'Update ': 'Updated '
  };
  
  for (const [prefix, replacement] of Object.entries(prefixMap)) {
    if (description.startsWith(prefix)) {
      description = replacement + description.slice(prefix.length);
      break;
    }
  }
  
  // Capitalize first letter
  return description.charAt(0).toUpperCase() + description.slice(1);
}

export function generateChangelog(commits: Commit[]): string {
  const changes: Array<{ type: keyof GroupedChanges; description: string }> = [];
  
  for (const commit of commits) {
    const parsed = parseCommitMessage(commit.message);
    if (parsed.isMetaCommit) continue; // Skip meta commits
    
    const category = categorizeCommit(parsed.type);
    const formatted = formatDescription(parsed.description);
    changes.push({ type: category, description: formatted });
  }
  
  // Sort by type order: added -> fixed -> changed -> removed
  const typeOrder: Record<keyof GroupedChanges, number> = {
    added: 0,
    fixed: 1,
    changed: 2,
    removed: 3,
  };
  
  changes.sort((a, b) => typeOrder[a.type] - typeOrder[b.type]);
  
  return changes.map(c => `- ${c.description}`).join('\n');
}

export function isVersionCommit(message: string): boolean {
  return message.includes('Set version to');
}

export function isChangelogCommit(message: string): boolean {
  return message.includes('chore: Update changelog');
}
