import type { Octokit } from "octokit";
import { loadConfig } from "../config";
import { debug, error } from "./console";

export interface RepoSelectionOptions {
  repo?: string;
  org?: string;
  team?: string;
  pattern?: string;
}

export interface ResolvedRepoSelection {
  organization: string;
  team?: string;
  pattern?: string;
}

/**
 * Resolves repository selection options by merging command-line options with config defaults.
 * Exits if organization is not specified.
 */
export async function resolveRepoSelectionOptions(
  options: RepoSelectionOptions
): Promise<ResolvedRepoSelection> {
  const config = await loadConfig();

  const organization = options.org || config.organization;
  if (!organization) {
    error(
      "Organization not specified. Use --org or set it in salve.config.json"
    );
    process.exit(1);
  }

  return {
    organization,
    team: options.team || config.team,
    pattern: options.pattern,
  };
}

/**
 * Fetches repositories from GitHub based on organization/team and applies filters.
 * Returns an array of full repository names (e.g., "org/repo").
 */
export async function getRepositories(
  octokit: Octokit,
  organization: string,
  team?: string,
  pattern?: string
): Promise<string[]> {
  try {
    let repos: { full_name: string }[];

    if (team) {
      debug(
        `Fetching repositories for team: ${team} in organization: ${organization}`
      );
      repos = await octokit.paginate(octokit.rest.teams.listReposInOrg, {
        org: organization,
        team_slug: team,
        per_page: 100,
      });
    } else {
      debug(`Fetching repositories for organization: ${organization}`);
      repos = await octokit.paginate(octokit.rest.repos.listForOrg, {
        org: organization,
        per_page: 100,
      });
    }

    let repoNames = repos.map((r) => r.full_name);

    // Load config for excluded repositories
    const config = await loadConfig();
    if (config.excludedRepositories.length > 0) {
      const excluded = new Set(config.excludedRepositories);
      const beforeCount = repoNames.length;
      repoNames = repoNames.filter((name) => !excluded.has(name));
      const excludedCount = beforeCount - repoNames.length;
      if (excludedCount > 0) {
        debug(`Excluded ${excludedCount} repositories from config`);
      }
    }

    if (pattern) {
      debug(`Filtering repositories by pattern: ${pattern}`);
      const regex = new RegExp(pattern);
      repoNames = repoNames.filter((name) => regex.test(name));
    }

    return repoNames;
  } catch (err) {
    error(
      `Failed to fetch repositories for ${
        team ? `team '${team}' in ` : ""
      }organization '${organization}'`
    );
    process.exit(1);
  }
}

/**
 * Resolves the list of repositories to process based on options.
 * If a specific repo is provided, returns just that one.
 * Otherwise fetches from GitHub with filters applied.
 */
export async function resolveRepositories(
  octokit: Octokit,
  options: RepoSelectionOptions
): Promise<string[]> {
  const { organization, team, pattern } = await resolveRepoSelectionOptions(options);

  if (options.repo) {
    return [`${organization}/${options.repo}`];
  }

  const repos = await getRepositories(octokit, organization, team, pattern);
  debug(`Found ${repos.length} repositories to process`);
  return repos;
}
