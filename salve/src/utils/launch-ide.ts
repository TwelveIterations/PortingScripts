import { spawn } from 'child_process';
import { loadConfig } from '../config';
import { error, info } from './console';

/**
 * Launch IDE using the configured IDE command directly on a folder path
 * This should be used when opening repository folders rather than specific files
 */
export async function launchIde(folderPath: string): Promise<void> {
  const config = await loadConfig();

  if (!config.ide) {
    error('IDE is not configured. Please set it in the config file.');
    info('Run "salve config" to open the configuration file.');
    throw new Error('IDE not configured');
  }

  return new Promise((resolve, reject) => {
    info(`Opening folder in ${config.ide}...`);
    
    // Run the configured IDE command directly
    const ideProcess = spawn(config.ide, [folderPath], {
      stdio: 'inherit',
      shell: true
    });

    ideProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`IDE command exited with code ${code}`));
      }
    });

    ideProcess.on('error', (err) => {
      reject(new Error(`Failed to launch IDE command: ${err.message}`));
    });
  });
}
