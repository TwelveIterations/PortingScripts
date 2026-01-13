import { describe, it, expect } from 'bun:test';
import { parseCommitMessage, generateChangelog, stripIssueSuffixes } from '../src/utils/changelog-utils';
import type { Commit } from '../src/utils/changelog-utils';

describe('parseCommitMessage', () => {
  it('should identify merge commits as meta commits', () => {
    const result = parseCommitMessage('Merge branch feature-xyz into main');
    expect(result.isMetaCommit).toBe(true);
    expect(result.type).toBe('merge');
    expect(result.description).toBe('Merge branch feature-xyz into main');
  });

  it('should identify merge commits with quotes as meta commits', () => {
    const result = parseCommitMessage('Merge branch "feature/add-new-component"');
    expect(result.isMetaCommit).toBe(true);
    expect(result.type).toBe('merge');
    expect(result.description).toBe('Merge branch "feature/add-new-component"');
  });

  it('should still identify conventional meta commits', () => {
    const choreResult = parseCommitMessage('chore: update dependencies');
    expect(choreResult.isMetaCommit).toBe(true);
    expect(choreResult.type).toBe('chore');

    const buildResult = parseCommitMessage('build: update webpack config');
    expect(buildResult.isMetaCommit).toBe(true);
    expect(buildResult.type).toBe('build');

    const ciResult = parseCommitMessage('ci: add github actions');
    expect(ciResult.isMetaCommit).toBe(true);
    expect(ciResult.type).toBe('ci');
  });

  it('should still identify regular commits', () => {
    const result = parseCommitMessage('feat: add new feature');
    expect(result.isMetaCommit).toBe(false);
    expect(result.type).toBe('feat');
  });
});

describe('stripIssueSuffixes', () => {
  it('should strip (#123) suffixes', () => {
    expect(stripIssueSuffixes('Add new feature (#123)')).toBe('Add new feature');
    expect(stripIssueSuffixes('Fix critical bug (#456)')).toBe('Fix critical bug');
  });

  it('should strip #123 suffixes', () => {
    expect(stripIssueSuffixes('Add new feature #123')).toBe('Add new feature');
    expect(stripIssueSuffixes('Fix critical bug #456')).toBe('Fix critical bug');
  });

  it('should handle multiple digits', () => {
    expect(stripIssueSuffixes('Add new feature (#1234)')).toBe('Add new feature');
    expect(stripIssueSuffixes('Fix critical bug #98765')).toBe('Fix critical bug');
  });

  it('should handle whitespace around suffixes', () => {
    expect(stripIssueSuffixes('Add new feature  (#123)')).toBe('Add new feature');
    expect(stripIssueSuffixes('Add new feature (#123) ')).toBe('Add new feature');
    expect(stripIssueSuffixes('Add new feature  #123  ')).toBe('Add new feature');
  });

  it('should not affect messages without issue suffixes', () => {
    expect(stripIssueSuffixes('Add new feature')).toBe('Add new feature');
    expect(stripIssueSuffixes('Fix critical bug')).toBe('Fix critical bug');
    expect(stripIssueSuffixes('Add new feature (123)')).toBe('Add new feature (123)'); // Not in # format
    expect(stripIssueSuffixes('Add new feature #abc')).toBe('Add new feature #abc'); // Not numeric
  });

  it('should handle edge cases', () => {
    expect(stripIssueSuffixes('Add new feature (#123) and more text')).toBe('Add new feature (#123) and more text'); // Not at end
    expect(stripIssueSuffixes('Add new feature (#123')).toBe('Add new feature ('); // Incomplete pattern stripped
    expect(stripIssueSuffixes('Add new feature #123)')).toBe('Add new feature #123)'); // Mismatched parentheses
  });

  it('should strip multiple issue suffixes', () => {
    expect(stripIssueSuffixes('Add new feature (#123) #456')).toBe('Add new feature');
    expect(stripIssueSuffixes('Fix critical bug (#789) (#1011)')).toBe('Fix critical bug');
    expect(stripIssueSuffixes('Update component #123 #456 #789')).toBe('Update component');
    expect(stripIssueSuffixes('Remove deprecated code (#123)  #456  ')).toBe('Remove deprecated code');
  });
});

describe('generateChangelog', () => {
  it('should filter out merge commits', () => {
    const commits: Commit[] = [
      { hash: 'abc123', message: 'feat: add new feature' },
      { hash: 'def456', message: 'Merge branch feature-xyz into main' },
      { hash: 'ghi789', message: 'fix: resolve bug' }
    ];

    const changelog = generateChangelog(commits);
    
    expect(changelog).toContain('Add new feature');
    expect(changelog).toContain('Resolve bug');
    expect(changelog).not.toContain('Merge branch');
  });

  it('should filter out all meta commits including merge commits', () => {
    const commits: Commit[] = [
      { hash: 'abc123', message: 'feat: add new feature' },
      { hash: 'def456', message: 'Merge branch feature-xyz into main' },
      { hash: 'ghi789', message: 'chore: update dependencies' },
      { hash: 'jkl012', message: 'fix: resolve bug' },
      { hash: 'mno345', message: 'build: update webpack' }
    ];

    const changelog = generateChangelog(commits);
    
    expect(changelog).toContain('Add new feature');
    expect(changelog).toContain('Resolve bug');
    expect(changelog).not.toContain('Merge branch');
    expect(changelog).not.toContain('chore: update dependencies');
    expect(changelog).not.toContain('build: update webpack');
  });

  it('should strip issue suffixes from changelog entries', () => {
    const commits: Commit[] = [
      { hash: 'abc123', message: 'feat: add new feature (#123)' },
      { hash: 'def456', message: 'fix: resolve critical bug #456' },
      { hash: 'ghi789', message: 'Add component #789' },
      { hash: 'jkl012', message: 'Fix issue (#1010)' }
    ];

    const changelog = generateChangelog(commits);
    
    expect(changelog).toContain('Add new feature');
    expect(changelog).toContain('Resolve critical bug');
    expect(changelog).toContain('Component');
    expect(changelog).toContain('Issue');
    expect(changelog).not.toContain('#123');
    expect(changelog).not.toContain('#456');
    expect(changelog).not.toContain('#789');
    expect(changelog).not.toContain('#1010');
    expect(changelog).not.toContain('(#123)');
    expect(changelog).not.toContain('(#1010)');
  });
});
