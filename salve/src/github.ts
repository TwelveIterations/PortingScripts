import { Octokit } from 'octokit';
import { createOAuthDeviceAuth } from '@octokit/auth-oauth-device';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';

const SALVE_DIR = join(homedir(), '.salve');
const TOKEN_FILE = join(SALVE_DIR, 'github-token.json');

const CLIENT_ID = process.env.SALVE_GITHUB_CLIENT_ID || 'Ov23liUKcG2zjXpQcKEg';

interface StoredToken {
  token: string;
  tokenType: string;
  expiresAt?: string;
  refreshToken?: string;
  refreshTokenExpiresAt?: string;
}

function ensureSalveDir(): void {
  if (!existsSync(SALVE_DIR)) {
    mkdirSync(SALVE_DIR, { recursive: true });
  }
}

export async function saveToken(tokenData: StoredToken): Promise<void> {
  ensureSalveDir();
  await Bun.write(TOKEN_FILE, JSON.stringify(tokenData, null, 2));
}

export async function loadToken(): Promise<StoredToken | null> {
  if (!existsSync(TOKEN_FILE)) {
    return null;
  }

  try {
    const file = Bun.file(TOKEN_FILE);
    return await file.json();
  } catch {
    return null;
  }
}

export async function clearToken(): Promise<void> {
  if (existsSync(TOKEN_FILE)) {
    await Bun.write(TOKEN_FILE, '');
    const fs = await import('fs/promises');
    await fs.unlink(TOKEN_FILE);
  }
}

export async function authenticateWithDeviceFlow(): Promise<string> {
  console.log(chalk.blue('Starting GitHub OAuth device flow authentication...\n'));

  const auth = createOAuthDeviceAuth({
    clientType: 'oauth-app',
    clientId: CLIENT_ID,
    scopes: ['repo', 'read:org'],
    onVerification(verification) {
      console.log(chalk.yellow('To authenticate, please visit:'));
      console.log(chalk.cyan.bold(`  ${verification.verification_uri}`));
      console.log();
      console.log(chalk.yellow('And enter the code:'));
      console.log(chalk.green.bold(`  ${verification.user_code}`));
      console.log();
      console.log(chalk.gray(`This code expires in ${Math.floor(verification.expires_in / 60)} minutes.`));
      console.log(chalk.gray('Waiting for authentication...'));
    },
  });

  const tokenAuth = await auth({ type: 'oauth' });

  const tokenData: StoredToken = {
    token: tokenAuth.token,
    tokenType: tokenAuth.tokenType,
  };

  await saveToken(tokenData);

  return tokenAuth.token;
}

export async function getOctokit(): Promise<Octokit> {
  const tokenData = await loadToken();

  if (!tokenData) {
    console.error(chalk.red('Not authenticated with GitHub.'));
    console.error(chalk.yellow('Run: salve auth github'));
    process.exit(1);
  }

  return new Octokit({ auth: tokenData.token });
}

export async function checkAuth(): Promise<boolean> {
  const tokenData = await loadToken();
  if (!tokenData) {
    return false;
  }

  try {
    const octokit = new Octokit({ auth: tokenData.token });
    await octokit.rest.users.getAuthenticated();
    return true;
  } catch {
    return false;
  }
}
