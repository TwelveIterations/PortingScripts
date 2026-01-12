import chalk from 'chalk';

let verboseMode = false;

export function setVerboseMode(enabled: boolean) {
  verboseMode = enabled;
}

export function debug(msg: string) {
  if (!verboseMode) return;
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console.log(`${chalk.blue(`[${timestamp}]`)} ${msg}`);
}

export function renderProgressBar(current: number, total: number, width = 30): string {
  const percent = current / total;
  const filled = Math.round(width * percent);
  const empty = width - filled;
  const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  return `[${bar}] ${current}/${total}`;
}

export function clearLine() {
  process.stdout.write('\r\x1b[K');
}

export function error(msg: string) {
  console.error(`${chalk.red('[ERROR]')} ${msg}`);
}

export function success(msg: string) {
  console.log(`${chalk.green('[SUCCESS]')} ${msg}`);
}

export function warn(msg: string) {
  console.log(`${chalk.yellow('[WARNING]')} ${msg}`);
}

export function info(msg: string) {
  console.log(`${chalk.blue('[INFO]')} ${msg}`);
}

export async function promptUser(question: string, defaultToYes: boolean = false): Promise<boolean> {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    const prompt = defaultToYes ? `${question} (Y/n): ` : `${question} (y/N): `;
    rl.question(prompt, (answer) => {
      rl.close();
      const normalizedAnswer = answer.toLowerCase().trim();
      
      if (defaultToYes) {
        resolve(normalizedAnswer === 'n' || normalizedAnswer === 'no' ? false : true);
      } else {
        resolve(normalizedAnswer === 'y' || normalizedAnswer === 'yes');
      }
    });
  });
}