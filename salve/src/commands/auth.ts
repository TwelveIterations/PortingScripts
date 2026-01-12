import chalk from 'chalk';
import { authenticateWithDeviceFlow, checkAuth, clearToken, loadToken } from '../github';
import { Octokit } from 'octokit';

export async function authGitHub(): Promise<void> {
  try {
    const token = await authenticateWithDeviceFlow();
    
    const octokit = new Octokit({ auth: token });
    const { data: user } = await octokit.rest.users.getAuthenticated();
    
    console.log();
    console.log(chalk.green('✓ Successfully authenticated as:'), chalk.bold(user.login));
  } catch (error) {
    console.error(chalk.red('Authentication failed:'), error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

export async function authStatus(): Promise<void> {
  const tokenData = await loadToken();
  
  if (!tokenData) {
    console.log(chalk.yellow('Not authenticated with GitHub.'));
    console.log(chalk.gray('Run: salve auth github'));
    return;
  }

  const isValid = await checkAuth();
  
  if (isValid) {
    const octokit = new Octokit({ auth: tokenData.token });
    const { data: user } = await octokit.rest.users.getAuthenticated();
    console.log(chalk.green('✓ Authenticated as:'), chalk.bold(user.login));
  } else {
    console.log(chalk.red('✗ Token is invalid or expired.'));
    console.log(chalk.gray('Run: salve auth github'));
  }
}

export async function authLogout(): Promise<void> {
  await clearToken();
  console.log(chalk.green('✓ Logged out from GitHub.'));
}
