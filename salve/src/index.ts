#!/usr/bin/env bun

import { Command } from 'commander';
import { fetchUnreleasedCommits } from './commands/fetch-unreleased-commits';
import { authGitHub, authStatus, authLogout } from './commands/auth';
import { changelog } from './commands/changelog';
import { release } from './commands/release';
import { patch } from './commands/patch';
import { copyFileToRepos } from './commands/copy';
import { config } from './commands/config';
import { ide } from './commands/ide';
import { cloneRepos } from './commands/clone';

const program = new Command();

program
  .name('salve')
  .description('Salve CLI')
  .version('1.0.0');

const auth = program
  .command('auth')
  .description('Manage GitHub authentication');

auth
  .command('github')
  .description('Authenticate with GitHub using OAuth device flow')
  .action(authGitHub);

auth
  .command('status')
  .description('Check GitHub authentication status')
  .action(authStatus);

auth
  .command('logout')
  .description('Log out from GitHub')
  .action(authLogout);

program
  .command('unreleased')
  .description('Fetch unreleased commits for repositories')
  .argument('<branch>', 'Version branch to analyze (e.g., 1.20.1)')
  .option('--org <organization>', 'GitHub organization name')
  .option('--team <team>', 'Team name to filter repositories')
  .option('--pattern <pattern>', 'Repository name pattern (regex)')
  .option('--verbose', 'Show detailed debug logs')
  .action(fetchUnreleasedCommits);

program
  .command('changelog')
  .description('Generate changelog from commits since last version')
  .argument('<repo>', 'Repository name')
  .argument('<branch>', 'Version branch to analyze (e.g., 1.20.1)')
  .option('--verbose', 'Show detailed debug logs')
  .action(changelog);

program
  .command('release')
  .description('Trigger release workflow for a mod')
  .argument('<branch>', 'Version branch to release (e.g., 1.20.1)')
  .option('--org <organization>', 'GitHub organization name')
  .option('--team <team>', 'Team name to filter repositories')
  .option('--pattern <pattern>', 'Repository name pattern (regex)')
  .option('--repo <repo>', 'Repository name (defaults to all)')
  .option('--loader <loader>', 'Loader to release for (defaults to all supported)')
  .option('--verbose', 'Show detailed debug logs')
  .action(release);

program
  .command('patch')
  .description('Apply a patch file to repositories')
  .argument('<patch>', 'Path to the patch file to apply')
  .requiredOption('--branch <branch>', 'Version branch to apply patch to (e.g., 1.20.1)')
  .option('--org <organization>', 'GitHub organization name')
  .option('--team <team>', 'Team name to filter repositories')
  .option('--pattern <pattern>', 'Repository name pattern (regex)')
  .option('--repo <repo>', 'Repository name (defaults to all)')
  .option('--verbose', 'Show detailed debug logs')
  .action(patch);

program
  .command('copy')
  .description('Copy a file to repositories')
  .argument('<file>', 'Path to the file to copy')
  .requiredOption('--branch <branch>', 'Version branch to copy file to (e.g., 1.20.1)')
  .option('--org <organization>', 'GitHub organization name')
  .option('--team <team>', 'Team name to filter repositories')
  .option('--pattern <pattern>', 'Repository name pattern (regex)')
  .option('--repo <repo>', 'Repository name (defaults to all)')
  .option('--verbose', 'Show detailed debug logs')
  .action(copyFileToRepos);

program
  .command('config')
  .description('Open configuration file in editor')
  .option('--verbose', 'Show detailed debug logs')
  .action(config);

program
  .command('ide')
  .description('Open a repository in the configured IDE')
  .argument('<repo>', 'Repository name')
  .argument('<branch>', 'Version branch')
  .option('--verbose', 'Show detailed debug logs')
  .action(ide);

program
  .command('clone')
  .description('Clone repositories and checkout a specific branch')
  .argument('<branch>', 'Branch to checkout (e.g., 1.20.1)')
  .option('--org <organization>', 'GitHub organization name')
  .option('--team <team>', 'Team name to filter repositories')
  .option('--pattern <pattern>', 'Repository name pattern (regex)')
  .option('--repo <repo>', 'Repository name (defaults to all)')
  .option('--verbose', 'Show detailed debug logs')
  .action(cloneRepos);

program.parse();
