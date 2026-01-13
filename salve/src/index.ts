#!/usr/bin/env bun

import { Command } from 'commander';
import { fetchUnreleasedCommits } from './commands/fetch-unreleased-commits';
import { authGitHub, authStatus, authLogout } from './commands/auth';
import { changelog } from './commands/changelog';
import { release } from './commands/release';
import { patch } from './commands/patch';
import { config } from './commands/config';
import { ide } from './commands/ide';

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
  .requiredOption('--branch <branch>', 'Version branch to analyze (e.g., 1.20.1)')
  .option('--org <organization>', 'GitHub organization name')
  .option('--team <team>', 'Team name to filter repositories')
  .option('--pattern <pattern>', 'Repository name pattern (regex)')
  .option('--max-repos <num>', 'Maximum repositories to process', '100')
  .option('--json', 'Output results in JSON format')
  .option('--verbose', 'Show detailed progress logs')
  .action(fetchUnreleasedCommits);

program
  .command('changelog')
  .description('Generate changelog from commits since last version')
  .argument('<repo>', 'Repository name')
  .argument('<branch>', 'Version branch to analyze (e.g., 1.20.1)')
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
  .option('--dry', 'Dry run - do not trigger release workflows')
  .option('--force', 'Force release, bypassing all safety checks')
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
  .action(patch);

program
  .command('config')
  .description('Open configuration file in editor')
  .action(config);

program
  .command('ide')
  .description('Open a repository in the configured IDE')
  .argument('<repo>', 'Repository name')
  .argument('<branch>', 'Version branch')
  .action(ide);

program.parse();
