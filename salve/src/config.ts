import { z } from 'zod';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const configSchema = z.object({
  excludedRepositories: z.array(z.string()).optional().default([]),
  organization: z.string().optional(),
  team: z.string().optional(),
  repositoriesPath: z.string().optional(),
  ide: z.string().optional().default('intellij-idea-community'),
});

export type Config = z.infer<typeof configSchema>;

const CONFIG_FILENAME = 'salve.config.json';

export { CONFIG_FILENAME };

export function getConfigPath(): string {
  return join(homedir(), CONFIG_FILENAME);
}

export async function loadConfig(): Promise<Config> {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return configSchema.parse({});
  }

  try {
    const file = Bun.file(configPath);
    const content = await file.json();
    return configSchema.parse(content);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error(`Invalid config in ${CONFIG_FILENAME}:`);
      for (const issue of error.issues) {
        console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
      }
      process.exit(1);
    }
    throw error;
  }
}
