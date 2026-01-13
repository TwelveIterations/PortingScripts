import chalk from 'chalk';
import { loadConfig } from '../config';
import { join } from 'path';
import { existsSync } from 'fs';
import launchEditor from 'launch-editor';
import type { Commit } from '../utils/changelog-utils';
import { error, success, info, debug, promptUser } from '../utils/console';
import { isVersionCommit, generateChangelog } from '../utils/changelog-utils';
import { hasUncommittedChanges, commitChanges, addFile, pushChanges, getCommitsToPush, getGitStatus, getCommitLog } from '../utils/git-utils';
import { findRepository } from '../utils/fuzzy-search';

interface Options {
  repo: string;
  branch: string;
}

async function getNonChangelogChanges(repoPath: string): Promise<string[]> {
  try {
    const result = await getGitStatus(repoPath);
    const lines = result.split('\n').filter(l => l.length > 0);
    
    return lines
      .map(line => {
        const parts = line.trim().split(/\s+/);
        return parts.length >= 2 ? parts[1] : undefined;
      })
      .filter((file): file is string => file !== undefined && file !== 'CHANGELOG.md');
  } catch (err) {
    return [];
  }
}

async function hasEffectiveChangelogChanges(repoPath: string): Promise<boolean> {
  try {
    const changelogPath = join(repoPath, 'CHANGELOG.md');
    if (!existsSync(changelogPath)) return false;
    
    const content = await Bun.file(changelogPath).text();
    const lines = content.split('\n');
    const filteredLines = lines.filter(line => !line.startsWith('>'));
    const effectiveContent = filteredLines.join('\n').trim();
    
    // Check if there are effective changes (non-commented content)
    return effectiveContent.length > 0;
  } catch (err) {
    return false;
  }
}

async function prepareChangelogForEdit(repoPath: string, commits: Commit[]): Promise<void> {
  const changelogPath = join(repoPath, 'CHANGELOG.md');
  
  const hasChangelogChanges = await hasEffectiveChangelogChanges(repoPath);
  
  let existingContent = '';
  if (hasChangelogChanges) {
    existingContent = await Bun.file(changelogPath).text();
      const lines = existingContent.split('\n');
      const filteredLines = lines.filter(line => !line.startsWith('>'));
      existingContent = filteredLines.join('\n');
  } else {
    existingContent = generateChangelog(commits);
  }

    const commentedCommits = commits.map(commit => `> ${commit.hash} ${commit.message}`).join('\n');
    const newContent = existingContent + (existingContent && !existingContent.endsWith('\n') ? '\n' : '') + commentedCommits + '\n';
    await Bun.write(changelogPath, newContent);
}

async function removeCommentedLines(repoPath: string): Promise<void> {
  const changelogPath = join(repoPath, 'CHANGELOG.md');
  
  if (!existsSync(changelogPath)) return;
  
  const content = await Bun.file(changelogPath).text();
  const lines = content.split('\n');
  const filteredLines = lines.filter(line => !line.startsWith('>'));
  
  await Bun.write(changelogPath, filteredLines.join('\n'));
}

async function commitChangelogOnly(repoPath: string, message: string): Promise<void> {
  try {
    await removeCommentedLines(repoPath);
    await addFile(repoPath, 'CHANGELOG.md');
    await commitChanges(repoPath, "chore: Update changelog")
  } catch (err) {
    throw new Error(`Failed to commit changelog: ${err}`);
  }
};

async function shouldAutoPushChangelog(repoPath: string): Promise<boolean> {
  try {
    const commitsToPush = await getCommitsToPush(repoPath);
    if (commitsToPush.length === 1) {
      const commitMessage = commitsToPush[0]!.substring(commitsToPush[0]!.indexOf(' ') + 1);
      return commitMessage.includes('chore: Update changelog');
    }
    
    return false;
  } catch (err) {
    return false;
  }
}

async function getLocalCommitsSinceVersion(repoPath: string): Promise<Commit[]> {
  try {
    const result = await getCommitLog(repoPath);
    const lines = result.split('\n').filter(l => l.length > 0);
    
    const commits: Commit[] = [];
    
    for (const line of lines) {
      const spaceIdx = line.indexOf(' ');
      if (spaceIdx === -1) continue;
      
      const hash = line.substring(0, spaceIdx);
      const message = line.substring(spaceIdx + 1);
      
      if (isVersionCommit(message)) {
        break;
      }
      
      commits.push({ hash: hash.substring(0, 7), message });
    }
    
    return commits;
  } catch (err) {
    throw new Error(`Failed to get commits from ${repoPath}: ${err}`);
  }
}

export async function changelog(repo: string, branch: string): Promise<void> {
  const config = await loadConfig();
  
  if (!config.repositoriesPath) {
    error('repositoriesPath must be configured in salve.config.json');
    process.exit(1);
  }
  
  const matchedRepo = findRepository(repo, branch, config.repositoriesPath);
  if (!matchedRepo) {
    error(`Repository '${repo}' not found in branch '${branch}'`);
    process.exit(1);
  }
  
  const repoPath = join(config.repositoriesPath, branch, matchedRepo);
  if (!existsSync(repoPath)) {
    error(`Repository not found at: ${repoPath}`);
    process.exit(1);
  }
  
  const changelogPath = join(repoPath, 'CHANGELOG.md');
  
  debug(`Analyzing commits in ${chalk.cyan(repoPath)}...`);
  
  const hasChanges = await hasUncommittedChanges(repoPath);
  if (hasChanges) {
    const nonChangelogFiles = await getNonChangelogChanges(repoPath);
    if (nonChangelogFiles.length > 0) {
      error(`There are uncommited changes in this repository: ${nonChangelogFiles.join(', ')}`);
      error('Please commit or stash these changes first.');
      
      const shouldOpenProject = await promptUser('Do you want to open the project in your IDE now?', true);
      if (shouldOpenProject) {
        try {
          launchEditor(repoPath, config.ide);
        } catch (err) {
          error(`Failed to open project with ${config.ide}: ${err}`);
        }
      }
      
      process.exit(1);
    }
    
    let changelogContent = await Bun.file(changelogPath).text();
    const lines = changelogContent.split('\n');
    const filteredLines = lines.filter(line => !line.startsWith('>'));
    changelogContent = filteredLines.join('\n');
    
    if (changelogContent.trim().length) {
      info('Pending Changelog:');
      console.log(changelogContent);
      
      const shouldCommit = await promptUser('Do you want to commit the changelog changes?');
      if (shouldCommit) {
        await commitChangelogOnly(repoPath, 'chore: Update changelog');
        success('Changelog committed');
        
        if (await shouldAutoPushChangelog(repoPath)) {
          try {
            await pushChanges(repoPath);
            success('Changelog pushed to remote');
          } catch (err) {
            error('Failed to push changelog');
          }
        }
        
        process.exit(1);
      }
    }
  }
  
  const commits = await getLocalCommitsSinceVersion(repoPath);
  if (commits.length === 0) {
    info('No pending commits found.');
    return;
  }
  
  info(`Found ${chalk.green(commits.length)} commits since last version.`);
  await prepareChangelogForEdit(repoPath, commits);
  launchEditor(changelogPath, 'nano');
}
