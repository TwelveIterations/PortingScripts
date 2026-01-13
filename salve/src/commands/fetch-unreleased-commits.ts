import type { Octokit } from 'octokit';
import { loadConfig } from '../config';
import { getOctokit, checkAuth } from '../github';
import type { Commit } from '../utils/changelog-utils';
import { isVersionCommit, parseCommitMessage } from '../utils/changelog-utils';
import { error, success, warn, setVerboseMode, debug, renderProgressBar, clearLine } from '../utils/console';
import chalk from 'chalk';
import { resolveRepositories, type RepoSelectionOptions } from '../utils/repo-selection';

interface Options extends RepoSelectionOptions {
  verbose?: boolean;
}


async function ensureAuth(): Promise<void> {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    error('Not authenticated with GitHub.');
    error('Run: salve auth github');
    process.exit(1);
  }
}

async function getUnreleasedCommits(octokit: Octokit, repo: string, branch: string): Promise<Commit[]> {
  debug(`Analyzing repository: ${repo} (branch: ${branch})`);

  const parts = repo.split('/');
  const owner = parts[0]!;
  const repoName = parts[1]!;
  let targetBranch = branch;

  if (targetBranch === 'default') {
    try {
      const { data: repoInfo } = await octokit.rest.repos.get({ owner, repo: repoName });
      targetBranch = repoInfo.default_branch || 'main';
    } catch {
      targetBranch = 'main';
    }
  }

  try {
    const { data: commits } = await octokit.rest.repos.listCommits({
      owner,
      repo: repoName,
      sha: targetBranch,
      per_page: 100,
    });

    if (!commits || commits.length === 0) {
      warn(`No commits found for ${repo}`);
      return [];
    }

    // Find the first "Set version to..." commit (commits are newest first)
    const versionIdx = commits.findIndex(
      (c) => c.commit && c.commit.message && isVersionCommit(c.commit.message)
    );

    if (versionIdx === -1) {
      warn(`No 'Set version to' commit found in ${repo}, returning recent commits`);
      const allCommits = commits.slice(0, 50).map((c) => ({
        hash: c.sha.substring(0, 7),
        message: c.commit.message?.split('\n')[0] ?? '',
      }));
      
      // Filter out build/chore/ci commits
      const meaningfulCommits = allCommits.filter(commit => {
        const parsed = parseCommitMessage(commit.message);
        return !parsed.isMetaCommit; // Skip meta commits (build/chore/ci)
      });
      
      return meaningfulCommits;
    }

    if (versionIdx === 0) {
      // Version commit is the most recent, no unreleased commits
      return [];
    }

    // Return commits before the version commit (newer ones), but filter out build/chore/ci commits
    const allCommits = commits.slice(0, versionIdx).map((c) => ({
      hash: c.sha.substring(0, 7),
      message: c.commit.message?.split('\n')[0] ?? '',
    }));
    
    // Filter out build/chore/ci commits
    const meaningfulCommits = allCommits.filter(commit => {
      const parsed = parseCommitMessage(commit.message);
      return !parsed.isMetaCommit; // Skip meta commits (build/chore/ci)
    });
    
    return meaningfulCommits;
  } catch (err) {
    warn(`Failed to fetch commits for ${repo}`);
    return [];
  }
}

export async function fetchUnreleasedCommits(branch: string, options: Options): Promise<void> {
  setVerboseMode(options.verbose ?? false);
  
  await ensureAuth();
  const octokit = await getOctokit();

  debug('Starting unreleased commits analysis');
  debug(`Branch: ${branch}`);

  const repositories = await resolveRepositories(octokit, options);

  if (repositories.length === 0) {
    error('No repositories found');
    process.exit(1);
  }

  success(`Found ${repositories.length} repositories to analyze`);

  const results: Record<string, Commit[]> = {};
  let totalCommits = 0;

  const showProgress = !options.verbose;
  
  for (let i = 0; i < repositories.length; i++) {
    const repo = repositories[i]!;
    
    if (showProgress) {
      clearLine();
      process.stdout.write(`${renderProgressBar(i + 1, repositories.length)} Analyzing ${repo}...`);
    }
    
    const commits = await getUnreleasedCommits(octokit, repo, branch);

    if (commits.length > 0) {
      results[repo] = commits;
      totalCommits += commits.length;
      debug(`Found ${commits.length} unreleased commits in ${repo}`);
    } else {
      debug(`No unreleased commits found in ${repo}`);
    }
  }
  
  if (showProgress) {
    clearLine();
  }

  console.log();
  console.log(chalk.bold('Unreleased Commits Summary'));

  for (const [repo, commits] of Object.entries(results)) {
    console.log();
    console.log(chalk.underline(repo));
    for (const commit of commits) {
      console.log(`  ${commit.hash} - ${commit.message}`);
    }
  }

  console.log();
  console.log(chalk.bold(`Total: ${totalCommits} commits`));

  success('Analysis completed');
}
