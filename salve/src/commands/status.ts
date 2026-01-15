import chalk from "chalk";
import { loadConfig } from "../config";
import { error, success, info, warn, debug, setVerboseMode } from "../utils/console";
import { getOctokit } from "../github";
import { resolveRepositories, type RepoSelectionOptions } from "../utils/repo-selection";

interface StatusOptions extends RepoSelectionOptions {
  verbose?: boolean;
}

interface WorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  head_branch: string;
  created_at: string;
  updated_at: string;
  html_url: string;
}

interface RepoStatus {
  repoName: string;
  status: "success" | "failure" | "in_progress" | "pending" | "unknown";
  latestRun: WorkflowRun | null;
}

async function getLatestWorkflowRun(
  octokit: any,
  owner: string,
  repo: string,
  branch: string
): Promise<WorkflowRun | null> {
  try {
    debug(`Fetching workflow runs for ${owner}/${repo} on branch ${branch}`);
    
    const response = await octokit.rest.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      branch,
      per_page: 10, // Get the 10 most recent runs
    });

    if (response.data.workflow_runs.length === 0) {
      debug(`No workflow runs found for ${owner}/${repo} on branch ${branch}`);
      return null;
    }

    // Get the most recent run
    const latestRun = response.data.workflow_runs[0];
    
    return {
      id: latestRun.id,
      name: latestRun.name,
      status: latestRun.status,
      conclusion: latestRun.conclusion,
      head_branch: latestRun.head_branch,
      created_at: latestRun.created_at,
      updated_at: latestRun.updated_at,
      html_url: latestRun.html_url,
    };
  } catch (err) {
    debug(`Failed to fetch workflow runs for ${owner}/${repo}: ${err}`);
    return null;
  }
}

function getStatusEmoji(status: string, conclusion: string | null): string {
  if (status === "in_progress") return "🔄";
  if (status === "queued") return "⏳";
  if (status === "pending") return "⏳";
  if (conclusion === "success") return "✅";
  if (conclusion === "failure") return "❌";
  if (conclusion === "cancelled") return "🚫";
  if (conclusion === "timed_out") return "⏰";
  return "❓";
}

function getStatusColor(status: string, conclusion: string | null): (text: string) => string {
  if (status === "in_progress") return chalk.yellow;
  if (status === "queued" || status === "pending") return chalk.blue;
  if (conclusion === "success") return chalk.green;
  if (conclusion === "failure") return chalk.red;
  if (conclusion === "cancelled") return chalk.gray;
  if (conclusion === "timed_out") return chalk.magenta;
  return chalk.gray;
}

function getRepoStatus(status: string, conclusion: string | null): "success" | "failure" | "in_progress" | "pending" | "unknown" {
  if (conclusion === "success") return "success";
  if (conclusion === "failure" || conclusion === "timed_out") return "failure";
  if (status === "in_progress") return "in_progress";
  if (status === "queued" || status === "pending") return "pending";
  return "unknown";
}

export async function status(branch: string, options: StatusOptions): Promise<void> {
  setVerboseMode(options.verbose ?? false);

  const config = await loadConfig();

  if (!config.repositoriesPath) {
    error("repositoriesPath must be configured in salve.config.json");
    process.exit(1);
  }

  info(`Checking CI status for branch: ${chalk.cyan(branch)}`);

  const octokit = await getOctokit();
  const repositories = await resolveRepositories(octokit, options);

  if (repositories.length === 0) {
    warn("No repositories found matching the criteria");
    return;
  }

  info(`Found ${repositories.length} repositories to check`);

  const repoStatuses: RepoStatus[] = [];

  for (const repoFullName of repositories) {
    const [owner, repoName] = repoFullName.split("/");
    if (!owner || !repoName) {
      error(`Invalid repository name format: ${repoFullName}`);
      continue;
    }

    const latestRun = await getLatestWorkflowRun(octokit, owner, repoName, branch);
    
    let repoStatus: "success" | "failure" | "in_progress" | "pending" | "unknown";
    if (latestRun) {
      repoStatus = getRepoStatus(latestRun.status, latestRun.conclusion);
    } else {
      repoStatus = "unknown";
    }

    repoStatuses.push({
      repoName,
      status: repoStatus,
      latestRun,
    });
  }

  // Sort by status (success first, then in_progress/pending, then failure/unknown)
  repoStatuses.sort((a, b) => {
    const statusOrder = { success: 0, in_progress: 1, pending: 2, failure: 3, unknown: 4 };
    return statusOrder[a.status] - statusOrder[b.status];
  });

  // Print summary
  console.log();
  console.log(chalk.bold("CI Status Summary:"));
  console.log();

  const successCount = repoStatuses.filter(r => r.status === "success").length;
  const failureCount = repoStatuses.filter(r => r.status === "failure").length;
  const inProgressCount = repoStatuses.filter(r => r.status === "in_progress").length;
  const pendingCount = repoStatuses.filter(r => r.status === "pending").length;
  const unknownCount = repoStatuses.filter(r => r.status === "unknown").length;

  console.log(`${chalk.green("✅ Success")}: ${successCount}`);
  console.log(`${chalk.yellow("🔄 In Progress")}: ${inProgressCount}`);
  console.log(`${chalk.blue("⏳ Pending")}: ${pendingCount}`);
  console.log(`${chalk.red("❌ Failed")}: ${failureCount}`);
  console.log(`${chalk.gray("❓ Unknown")}: ${unknownCount}`);
  console.log();

  // Print detailed status for each repo
  console.log(chalk.bold("Repository Details:"));
  console.log();

  for (const repoStatus of repoStatuses) {
    if (repoStatus.latestRun) {
      const run = repoStatus.latestRun;
      const emoji = getStatusEmoji(run.status, run.conclusion);
      const color = getStatusColor(run.status, run.conclusion);
      const statusText = run.conclusion || run.status;
      
      console.log(`${emoji} ${color(repoStatus.repoName)}: ${color(statusText)}`);
      console.log(`   Workflow: ${run.name}`);
      console.log(`   Updated: ${new Date(run.updated_at).toLocaleString()}`);
      console.log(`   URL: ${chalk.underline(run.html_url)}`);
    } else {
      console.log(`❓ ${chalk.gray(repoStatus.repoName)}: No CI runs found`);
    }
    console.log();
  }

  // Exit with error code if there are failures
  if (failureCount > 0) {
    error(`${failureCount} repository/repositories have failing CI builds`);
    process.exit(1);
  } else if (inProgressCount > 0 || pendingCount > 0) {
    info(`${inProgressCount + pendingCount} repository/repositories have CI builds in progress or pending`);
  } else {
    success(`All ${successCount} repositories have successful CI builds`);
  }
}
