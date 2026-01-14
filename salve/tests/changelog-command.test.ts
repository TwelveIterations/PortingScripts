import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { prepareChangelogForEdit } from '../src/commands/changelog';
import { join } from 'path';
import type { Commit } from '../src/utils/changelog-utils';

describe('prepareChangelogForEdit', () => {
  const testRepoPath = '/tmp/test-changelog-repo';
  const changelogPath = join(testRepoPath, 'CHANGELOG.md');
  
  beforeEach(async () => {
    // Create test directory
    await Bun.$`mkdir -p ${testRepoPath}`;
  });
  
  afterEach(async () => {
    // Clean up test directory
    await Bun.$`rm -rf ${testRepoPath}`;
  });

  it('should generate new changelog even when existing changelog has content', async () => {
    // Create existing changelog with old content
    const oldContent = '- Old feature 1\n- Old bug fix\n> abc123 Old commit message\n';
    await Bun.write(changelogPath, oldContent);

    const commits: Commit[] = [
      { hash: 'def456', message: 'feat: add new awesome feature' },
      { hash: 'ghi789', message: 'fix: resolve critical bug' }
    ];

    await prepareChangelogForEdit(testRepoPath, commits);

    const newContent = await Bun.file(changelogPath).text();
    
    // Should contain the new generated changelog, not the old one
    expect(newContent).toContain('Add new awesome feature');
    expect(newContent).toContain('Resolve critical bug');
    expect(newContent).not.toContain('Old feature 1');
    expect(newContent).not.toContain('Old bug fix');
    
    // Should contain commented commits
    expect(newContent).toContain('> def456 feat: add new awesome feature');
    expect(newContent).toContain('> ghi789 fix: resolve critical bug');
  });

  it('should generate changelog when no existing changelog exists', async () => {
    const commits: Commit[] = [
      { hash: 'abc123', message: 'feat: add new feature' }
    ];

    await prepareChangelogForEdit(testRepoPath, commits);

    const content = await Bun.file(changelogPath).text();
    
    expect(content).toContain('Add new feature');
    expect(content).toContain('> abc123 feat: add new feature');
  });
});
