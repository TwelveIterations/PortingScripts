import { describe, it, expect } from 'bun:test';
import { parseCommitMessage, generateChangelog } from '../src/utils/changelog-utils';
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
});
