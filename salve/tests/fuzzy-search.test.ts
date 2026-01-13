import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { findRepository, findRepositoryByInitials, findRepositoryByCamelCasePattern } from '../src/utils/fuzzy-search';

describe('findRepository', () => {
  let testDir: string;
  let branchPath: string;

  beforeEach(() => {
    // Create a temporary directory for testing
    testDir = mkdtempSync(join(tmpdir(), 'test-repos-'));
    branchPath = join(testDir, 'main');
    
    // Create test repository directories
    const testRepos = [
      'CraftingSlots',
      'CraftingTweaks',
      'ClientTweaks',
      'MyAwesomeRepo', 
      'SimpleAPI',
      'DataProcessor',
      'UserInterface',
      'camelCaseRepo',
      'PascalCaseRepo',
      'UPPERCASEREPO'
    ];

    testRepos.forEach(repo => {
      const repoPath = join(branchPath, repo);
      Bun.write(join(repoPath, '.gitkeep'), '');
    });
  });

  afterEach(() => {
    // Clean up test directory
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should find exact matches', () => {
    const result = findRepository('CraftingSlots', 'main', testDir);
    expect(result).toBe('CraftingSlots');
  });

  it('should find repositories by initials (alternating case)', () => {
    const result = findRepository('CraSlo', 'main', testDir);
    expect(result).toBe('CraftingSlots');
  });

  it('should find repositories by uppercase initials', () => {
    const result = findRepository('CS', 'main', testDir);
    expect(result).toBe('CraftingSlots');
  });

  it('should find MyAwesomeRepo by initials', () => {
    const result = findRepository('MAR', 'main', testDir);
    expect(result).toBe('MyAwesomeRepo');
  });

  it('should find SimpleAPI by initials', () => {
    const result = findRepository('SA', 'main', testDir);
    expect(result).toBe('SimpleAPI');
  });

  it('should find DataProcessor by initials', () => {
    const result = findRepository('DP', 'main', testDir);
    expect(result).toBe('DataProcessor');
  });

  it('should find UserInterface by initials', () => {
    const result = findRepository('UI', 'main', testDir);
    expect(result).toBe('UserInterface');
  });

  it('should handle camelCase repositories', () => {
    const result = findRepository('cCR', 'main', testDir);
    expect(result).toBe('camelCaseRepo');
  });

  it('should handle PascalCase repositories', () => {
    const result = findRepository('PCR', 'main', testDir);
    expect(result).toBe('PascalCaseRepo');
  });

  it('should return null for non-existent repositories', () => {
    const result = findRepository('NonExistent', 'main', testDir);
    expect(result).toBeNull();
  });

  it('should return null for non-existent initials', () => {
    const result = findRepository('XYZ', 'main', testDir);
    expect(result).toBeNull();
  });

  it('should return null when branch directory does not exist', () => {
    const result = findRepository('CS', 'nonexistent', testDir);
    expect(result).toBeNull();
  });

  it('should be case insensitive for initials', () => {
    const result1 = findRepository('cs', 'main', testDir);
    const result2 = findRepository('Cs', 'main', testDir);
    const result3 = findRepository('CS', 'main', testDir);
    
    expect(result1).toBe('CraftingSlots');
    expect(result2).toBe('CraftingSlots');
    expect(result3).toBe('CraftingSlots');
  });

  it('should prefer ClientTweaks over CraftingTweaks when searching for CliTwe', () => {
    const result = findRepository('CliTwe', 'main', testDir);
    expect(result).toBe('ClientTweaks');
  });

  it('should handle partial matches correctly', () => {
    const result = findRepository('Client', 'main', testDir);
    expect(result).toBe('ClientTweaks');
  });

  it('should prefer better match when multiple repositories have same initials', () => {
    // Test with a pattern that could match both CraftingTweaks and ClientTweaks
    // CliTwe should prefer ClientTweaks because it has better consecutive character match
    const result = findRepository('CliTwe', 'main', testDir);
    expect(result).toBe('ClientTweaks');
  });

  it('should handle case where CraftingTweaks might come first in directory listing', () => {
    // Create a custom test with repositories in different order
    const customTestRepos = [
      'CraftingTweaks',  // This comes first
      'ClientTweaks',   // This comes second
      'OtherRepo'
    ];

    // Manually test the initials matching logic
    const result = findRepositoryByInitials('CliTwe', customTestRepos);
    expect(result).toBe('ClientTweaks'); // Should still prefer ClientTweaks despite order
  });

  it('should test camelCase pattern matching directly', () => {
    const testRepos = ['ClientTweaks', 'CraftingTweaks', 'OtherRepo'];
    
    // CliTwe should match ClientTweaks but not CraftingTweaks
    const result = findRepositoryByCamelCasePattern('CliTwe', testRepos);
    expect(result).toBe('ClientTweaks');
    
    // CraTwe should match CraftingTweaks but not ClientTweaks
    const result2 = findRepositoryByCamelCasePattern('CraTwe', testRepos);
    expect(result2).toBe('CraftingTweaks');
  });
});
