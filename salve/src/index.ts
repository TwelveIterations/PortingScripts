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
import { pullRepos } from './commands/pull';
import { dev } from './commands/dev';
import { status } from './commands/status';
import { push } from './commands/push';
import { upgrade } from './commands/upgrade';

const program = new Command();

program
  .name('salve')
  .description('Salve CLI')
  .version('1.0.0');

const auth = program
  .command('auth')
  .description('manage GitHub authentication');

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
  .description('find unreleased commits')
  .argument('<branch>', 'Version branch to analyze (e.g., 1.20.1)')
  .option('--org <organization>', 'GitHub organization name')
  .option('--team <team>', 'Team name to filter repositories')
  .option('--pattern <pattern>', 'Repository name pattern (regex)')
  .option('--verbose', 'Show detailed debug logs')
  .action(fetchUnreleasedCommits);

program
  .command('changelog')
  .description('generate changelog from commits')
  .argument('<repo>', 'Repository name')
  .argument('<branch>', 'Version branch to analyze (e.g., 1.20.1)')
  .option('--verbose', 'Show detailed debug logs')
  .action(changelog);

program
  .command('release')
  .description('release updates for a given version')
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
  .description('apply a patch to selected projects')
  .argument('<patch>', 'Path to the patch file to apply')
  .argument('<branch>', 'Version branch to apply patch to (e.g., 1.20.1)')
  .option('--org <organization>', 'GitHub organization name')
  .option('--team <team>', 'Team name to filter repositories')
  .option('--pattern <pattern>', 'Repository name pattern (regex)')
  .option('--repo <repo>', 'Repository name (defaults to all)')
  .option('--verbose', 'Show detailed debug logs')
  .action(patch);

program
  .command('copy')
  .description('copy a file to selected projects')
  .argument('<file>', 'Path to the file to copy')
  .argument('<branch>', 'Version branch to copy file to (e.g., 1.20.1)')
  .option('--org <organization>', 'GitHub organization name')
  .option('--team <team>', 'Team name to filter repositories')
  .option('--pattern <pattern>', 'Repository name pattern (regex)')
  .option('--repo <repo>', 'Repository name (defaults to all)')
  .option('--verbose', 'Show detailed debug logs')
  .action(copyFileToRepos);

program
  .command('config')
  .description('open configuration file in editor')
  .option('--verbose', 'Show detailed debug logs')
  .action(config);

program
  .command('ide')
  .description('open a project and branch in IDE')
  .argument('<repo>', 'Repository name')
  .argument('<branch>', 'Version branch')
  .option('--verbose', 'Show detailed debug logs')
  .action(ide);

program
  .command('clone')
  .description('clone repositories at a given branch')
  .argument('<branch>', 'Branch to checkout (e.g., 1.20.1)')
  .option('--org <organization>', 'GitHub organization name')
  .option('--team <team>', 'Team name to filter repositories')
  .option('--pattern <pattern>', 'Repository name pattern (regex)')
  .option('--repo <repo>', 'Repository name (defaults to all)')
  .option('--verbose', 'Show detailed debug logs')
  .action(cloneRepos);

program
  .command('pull')
  .description('pull changes for repositories at a given branch')
  .argument('<branch>', 'Branch to pull changes for (e.g., 1.20.1)')
  .option('--org <organization>', 'GitHub organization name')
  .option('--team <team>', 'Team name to filter repositories')
  .option('--pattern <pattern>', 'Repository name pattern (regex)')
  .option('--repo <repo>', 'Repository name (defaults to all)')
  .option('--verbose', 'Show detailed debug logs')
  .action(pullRepos);

program
  .command('dev')
  .description('start development on an issue')
  .argument('<repo>', 'Repository name')
  .argument('<issue>', 'Issue number')
  .option('--branch <branch>', 'Branch to checkout (e.g., 1.20.1), inferred from issue if not specified')
  .option('--org <organization>', 'GitHub organization name')
  .option('--verbose', 'Show detailed debug logs')
  .action(dev);

program
  .command('status')
  .description('check CI build status for repositories')
  .argument('<branch>', 'Version branch to check (e.g., 1.20.1)')
  .option('--org <organization>', 'GitHub organization name')
  .option('--team <team>', 'Team name to filter repositories')
  .option('--pattern <pattern>', 'Repository name pattern (regex)')
  .option('--repo <repo>', 'Repository name (defaults to all)')
  .option('--verbose', 'Show detailed debug logs')
  .action(status);

program
  .command('push')
  .description('push commits for a repository and branch')
  .argument('<repo>', 'Repository name')
  .argument('<branch>', 'Version branch (e.g., 1.20.1)')
  .option('--verbose', 'Show detailed debug logs')
  .action(push);

program
  .command('upgrade')
  .description('upgrade gradle version catalog with latest versions')
  .argument('<branch>', 'Version branch to upgrade (e.g., 1.20.1)')
  .option('--org <organization>', 'GitHub organization name')
  .option('--team <team>', 'Team name to filter repositories')
  .option('--pattern <pattern>', 'Repository name pattern (regex)')
  .option('--repo <repo>', 'Repository name (defaults to all)')
  .option('--verbose', 'Show detailed debug logs')
  .action(upgrade);

program.parse();
