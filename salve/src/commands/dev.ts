import chalk from "chalk";
import { loadConfig } from "../config";
import { join } from "path";
import { readdirSync, existsSync } from "fs";
import { launchIde } from "../utils/launch-ide";
import {
  error,
  success,
  info,
  warn,
  debug,
  setVerboseMode,
} from "../utils/console";
import { findRepository } from "../utils/fuzzy-search";
import {
  hasUncommittedChanges,
  hasUnpushedChanges,
  getCurrentBranch,
  checkoutBranch,
  createAndCheckoutBranch,
  pullChanges,
} from "../utils/git-utils";
import { getOctokit } from "../github";

interface Options {
  verbose?: boolean;
  branch?: string;
  org?: string;
}

interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: string;
  labels: Array<{ name: string }>;
  pull_request?: any;
}

async function getIssueDetails(
  repoName: string,
  issueNumber: number
): Promise<GitHubIssue> {
  const octokit = await getOctokit();

  try {
    const [owner, repo] = repoName.split("/");
    if (!owner || !repo) {
      throw new Error('Invalid repository name format. Expected "owner/repo".');
    }
    const response = await octokit.rest.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });

    return response.data as GitHubIssue;
  } catch (err) {
    throw new Error(
      `Failed to fetch issue #${issueNumber} from GitHub: ${err}`
    );
  }
}

function getBranchPrefixForIssue(issue: GitHubIssue): "feat" | "fix" {
  return issue.labels.find((it) => it.name === "Bug") ? "fix" : "feat";
}

function parseMinecraftVersionFromIssue(issueBody: string): string | null {
  // Look for "### Minecraft Version" followed by version number
  const minecraftVersionRegex =
    /###\s*Minecraft\s*Version\s*\n\s*([0-9]+\.[0-9]+\.[0-9]+)/i;
  const match = issueBody.match(minecraftVersionRegex);
  if (match && match[1]) {
    return match[1];
  }

  return null;
}

async function getDefaultBranch(repoName: string): Promise<string> {
  const octokit = await getOctokit();

  try {
    const [owner, repo] = repoName.split("/");
    if (!owner || !repo) {
      throw new Error('Invalid repository name format. Expected "owner/repo".');
    }

    const response = await octokit.rest.repos.get({
      owner,
      repo,
    });

    return response.data.default_branch;
  } catch (err) {
    throw new Error(`Failed to get default branch for ${repoName}: ${err}`);
  }
}

export async function dev(
  repo: string,
  issueNumber: string,
  options: Options
): Promise<void> {
  setVerboseMode(options.verbose ?? false);

  const config = await loadConfig();

  if (!config.repositoriesPath) {
    error("repositoriesPath must be configured in salve.config.json");
    process.exit(1);
  }

  // Resolve organization
  const organization = options.org || config.organization;
  if (!organization) {
    error("Organization not specified. Use --org or set it in salve.config.json");
    process.exit(1);
  }

  // Parse issue number
  const issueNum = parseInt(issueNumber, 10);
  if (isNaN(issueNum) || issueNum <= 0) {
    error("Issue number must be a positive integer");
    process.exit(1);
  }

  // Find repository first to get the actual repo name
  let matchedRepo = repo;
  let targetBranch = options.branch || "";
  
  if (!targetBranch) {
    // If no branch specified, scan all available branch folders to find the repo
    try {
      const branchDirs = readdirSync(config.repositoriesPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)
        .sort(); // Sort for consistent ordering
      
      for (const branch of branchDirs) {
        const found = findRepository(repo, branch, config.repositoriesPath);
        if (found) {
          matchedRepo = found;
          break;
        }
      }
    } catch (err) {
      debug(`Failed to scan branch directories: ${err}`);
    }
  } else {
    // Branch was specified, find repo in that branch
    const found = findRepository(repo, targetBranch, config.repositoriesPath);
    if (found) {
      matchedRepo = found;
    }
  }
  
  if (!matchedRepo) {
    error(`Repository '${repo}' not found`);
    process.exit(1);
  }

  // Construct full repo name for GitHub API
  const fullRepoName = `${organization}/${matchedRepo}`;

  // Get issue details from GitHub
  info(`Fetching details for issue #${issueNum} on ${fullRepoName}...`);
  let issue: GitHubIssue;
  try {
    issue = await getIssueDetails(fullRepoName, issueNum);
  } catch (err) {
    error(err instanceof Error ? err.message : "Failed to fetch issue details");
    process.exit(1);
  }

  info(`Found issue: ${chalk.cyan(issue.title)}`);
  debug(
    `Issue state: ${issue.state}, Labels: ${issue.labels
      .map((l) => l.name)
      .join(", ")}`
  );

  // If branch wasn't specified, try to parse from issue body
  if (!options.branch) {
    if (issue.body) {
      const minecraftVersion = parseMinecraftVersionFromIssue(issue.body);
      if (minecraftVersion) {
        targetBranch = minecraftVersion;
        info(`Found Minecraft version in issue: ${chalk.cyan(targetBranch)}`);
      }
    }

    // If no version found in issue, try to find repository in default branch
    if (!targetBranch) {
      try {
        const defaultBranch = await getDefaultBranch(fullRepoName);
        const found = findRepository(
          matchedRepo,
          defaultBranch,
          config.repositoriesPath
        );
        if (found) {
          targetBranch = defaultBranch;
          info(`Using default branch: ${chalk.cyan(targetBranch)}`);
        }
      } catch (err) {
        debug(`Failed to get default branch: ${err}`);
      }
    }
  }

  // If still no branch found, error out
  if (!targetBranch) {
    error("Could not determine target branch.");
    process.exit(1);
  }

  // Verify repository exists in the determined branch
  const repoPath = join(config.repositoriesPath, targetBranch, matchedRepo);
  if (!existsSync(repoPath)) {
    error(`Repository not found at: ${repoPath}`);
    process.exit(1);
  }

  debug(`Working with repository at ${chalk.cyan(repoPath)}`);

  // Check for uncommitted changes
  const hasUncommitted = await hasUncommittedChanges(repoPath);
  if (hasUncommitted) {
    error("There are uncommitted changes in this repository.");
    error("Please commit or stash these changes first.");
    process.exit(1);
  }

  // Check for unpushed changes
  const hasUnpushed = await hasUnpushedChanges(repoPath);
  if (hasUnpushed) {
    error("There are unpushed changes in this repository.");
    error("Please push these changes first.");
    process.exit(1);
  }

  // Determine issue type and branch name
  const branchPrefix = getBranchPrefixForIssue(issue);
  const branchName = `${branchPrefix}/${issueNum}`;

  info(`Creating branch: ${chalk.green(branchName)}`);

  try {
    // Get current branch
    const currentBranch = await getCurrentBranch(repoPath);
    debug(`Current branch: ${currentBranch}`);

    // Checkout to version branch if not already there
    if (currentBranch !== targetBranch) {
      info(`Checking out version branch: ${chalk.cyan(targetBranch)}`);
      await checkoutBranch(repoPath, targetBranch);
      success(`Checked out to ${targetBranch}`);
    }

    // Pull latest changes before creating new branch
    info(`Pulling latest changes from ${chalk.cyan(targetBranch)}...`);
    try {
      await pullChanges(repoPath);
      success(`Pulled latest changes`);
    } catch (err) {
      warn(`Failed to pull changes: ${err}`);
      warn(`Continuing with branch creation...`);
    }

    // Create and checkout the new feature/fix branch
    info(`Creating new branch: ${chalk.green(branchName)}`);
    await createAndCheckoutBranch(repoPath, branchName);
    success(`Created and checked out to ${branchName}`);
  } catch (err) {
    error(`Failed to checkout branches: ${err}`);
    process.exit(1);
  }

  // Open in IDE
  if (!config.ide) {
    warn("IDE is not configured. Skipping IDE opening.");
    info('Run "salve config" to configure your IDE.');
    return;
  }

  info(`Opening repository in ${config.ide}...`);
  try {
    await launchIde(repoPath);
  } catch (err) {
    error(`Failed to open repository: ${err}`);
  }
}
