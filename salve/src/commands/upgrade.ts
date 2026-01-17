import { getOctokit } from "../github";
import { loadConfig } from "../config";
import {
  error,
  success,
  debug,
  info,
  warn,
  promptUser,
  setVerboseMode,
} from "../utils/console";
import { hasLocalClone } from "../utils/git-utils";
import {
  resolveRepositories,
  type RepoSelectionOptions,
} from "../utils/repo-selection";
import { updateCatalogVersion } from "../utils/gradle-version-catalog";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import fabricAdapter from "../version-adapters/fabric";
import neoforgeAdapter from "../version-adapters/neoforge";
import forgeAdapter from "../version-adapters/forge";
import minecraftAdapter from "../version-adapters/minecraft";

import type { VersionInfo, VersionInfoAdapter } from "../version-adapters";
import neoformAdapter from "../version-adapters/neoform";

interface UpgradeOptions extends RepoSelectionOptions {
  verbose?: boolean;
}

interface VersionUpdate {
  artifact: string;
  currentVersion: string;
  newVersion: string;
}

const VERSION_ADAPTERS: Record<string, () => VersionInfoAdapter> = {
  "com.mojang:minecraft": () => minecraftAdapter(),
  "net.fabricmc.fabric-api:fabric-api": () => fabricAdapter({ artifact: "fabric-api" }),
  "net.fabricmc:fabric-loader": () => fabricAdapter({ artifact: "fabric-loader" }),
  "net.neoforged:neoforge": () => neoforgeAdapter(),
  "net.neoforged:neoform": () => neoformAdapter(),
  "net.minecraftforge:forge": () => forgeAdapter(),
};

async function findGradleVersionCatalog(
  repoPath: string,
): Promise<string | null> {
  const path = join(repoPath, "gradle/libs.versions.toml");
  if (existsSync(path)) {
    return path;
  }

  return null;
}

async function fetchLatestVersions(
  branch: string,
): Promise<Map<string, VersionInfo>> {
  const versions = new Map<string, VersionInfo>();

  for (const [artifact, adapterFactory] of Object.entries(VERSION_ADAPTERS)) {
    try {
      const adapter = adapterFactory();
      const version = await adapter.getLatestVersion(branch);
      if (version) {
        versions.set(artifact, version);
        debug(`Fetched latest ${artifact} version: ${version.version}`);
      } else {
        warn(`No version found for ${artifact}`);
      }
    } catch (err) {
      warn(
        `Failed to fetch version for ${artifact}: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  }

  // Show latest versions found
  if (versions.size > 0) {
    console.log(chalk.bold.blue("\nLatest Versions:"));
    console.log(chalk.gray("─".repeat(40)));
    for (const [artifact, versionInfo] of versions) {
      console.log(`${chalk.cyan(artifact)}: ${chalk.green(versionInfo.version)} (${chalk.yellow(versionInfo.minecraftVersion)})`);
    }
    console.log(chalk.gray("─".repeat(40)));
  }

  return versions;
}

async function findVersionUpdates(
  catalogContent: string,
  latestVersions: Map<string, VersionInfo>,
): Promise<VersionUpdate[]> {
  const updates: VersionUpdate[] = [];

  for (const [artifact, latestVersion] of latestVersions) {
    try {
      // Try library first (most common for dependencies)
      let result = await updateCatalogVersion({
        library: artifact,
        content: catalogContent,
      });

      // If library not found, try plugin
      if (!result.oldVersion) {
        try {
          result = await updateCatalogVersion({
            plugin: artifact,
            content: catalogContent,
          });
        } catch {
          // Plugin not found, continue to ref
        }
      }

      // If neither library nor plugin found, try ref
      if (!result.oldVersion) {
        try {
          result = await updateCatalogVersion({
            ref: artifact,
            content: catalogContent,
          });
        } catch {
          // Ref not found, skip this artifact
          continue;
        }
      }

      if (result.oldVersion && result.oldVersion !== latestVersion.version) {
        updates.push({
          artifact,
          currentVersion: result.oldVersion,
          newVersion: latestVersion.version,
        });
      }
    } catch (err) {
      // All approaches failed, skip this artifact
      debug(
        `Version ${artifact} not found in catalog using any approach: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  }

  return updates;
}

async function promptForUpdates(updates: VersionUpdate[]): Promise<boolean> {
  if (updates.length === 0) {
    info("No version updates available.");
    return false;
  }

  console.log(chalk.bold.yellow("\nVersion Updates Available:"));
  console.log(chalk.gray("─".repeat(50)));

  for (const update of updates) {
    console.log(
      `${chalk.cyan(update.artifact)}: ${chalk.red(update.currentVersion)} → ${chalk.green(update.newVersion)}`,
    );
  }

  console.log(chalk.gray("─".repeat(50)));

  const proceed = await promptUser(
    "\nDo you want to apply these updates? (y/N): ", true
  );
  return proceed;
}

async function applyUpdates(
  catalogContent: string,
  updates: VersionUpdate[],
): Promise<string> {
  let updatedContent = catalogContent;

  for (const update of updates) {
    // Try library first (most common for dependencies)
    let result = await updateCatalogVersion({
      library: update.artifact,
      version: update.newVersion,
      content: updatedContent,
    });

    // If library not found, try plugin
    if (!result.content || result.content === updatedContent) {
      try {
        result = await updateCatalogVersion({
          plugin: update.artifact,
          version: update.newVersion,
          content: updatedContent,
        });
      } catch {
        // Plugin not found, continue to ref
      }
    }

    // If neither library nor plugin worked, try ref
    if (!result.content || result.content === updatedContent) {
      try {
        result = await updateCatalogVersion({
          ref: update.artifact,
          version: update.newVersion,
          content: updatedContent,
        });
      } catch {
        // Ref not found, skip this update
        continue;
      }
    }

    if (result.content && result.content !== updatedContent) {
      updatedContent = result.content;
    }
  }

  return updatedContent;
}

export async function upgrade(branch: string, options: UpgradeOptions) {
  try {
    if (options.verbose) {
      setVerboseMode(true);
    }

    const config = await loadConfig();
    const octokit = await getOctokit();

    const repoFullNames = await resolveRepositories(octokit, options);

    if (repoFullNames.length === 0) {
      error("No repositories found matching the criteria");
      process.exit(1);
    }

    info(`Fetching latest versions for branch: ${branch}`);
    const latestVersions = await fetchLatestVersions(branch);

    if (latestVersions.size === 0) {
      error("No version information could be fetched");
      process.exit(1);
    }

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (const repoFullName of repoFullNames) {
      try {
        const [owner, repoName] = repoFullName.split("/");
        if (!repoName) {
          warn(`Invalid repository name format: ${repoFullName}, skipping`);
          skippedCount++;
          continue;
        }
        const localRepoPath = join(config.repositoriesPath || ".", branch, repoName);

        if (!hasLocalClone(localRepoPath)) {
          warn(`No local clone found for ${repoFullName}, skipping`);
          skippedCount++;
          continue;
        }

        const catalogPath = await findGradleVersionCatalog(localRepoPath);
        if (!catalogPath) {
          warn(`No gradle version catalog found for ${repoFullName}, skipping`);
          skippedCount++;
          continue;
        }

        info(`Checking ${repoFullName}...`);

        const catalogContent = readFileSync(catalogPath, "utf-8");
        const updates = await findVersionUpdates(
          catalogContent,
          latestVersions,
        );

        if (updates.length === 0) {
          info(`No updates needed for ${repoFullName}`);
          successCount++;
          continue;
        }

        console.log(chalk.bold(`\n${repoFullName}:`));
        const proceed = await promptForUpdates(updates);

        if (proceed) {
          const updatedContent = await applyUpdates(catalogContent, updates);
          writeFileSync(catalogPath, updatedContent, "utf-8");
          success(`Updated ${updates.length} versions in ${catalogPath}`);
          successCount++;
        } else {
          info(`Skipped updates for ${repoFullName}`);
          skippedCount++;
        }
      } catch (err) {
        error(
          `Failed to process ${repoFullName}: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
        errorCount++;
      }
    }

    console.log(chalk.bold("\nUpgrade Summary:"));
    console.log(chalk.gray("─".repeat(30)));
    console.log(`✅ Successfully processed: ${successCount}`);
    if (skippedCount > 0) {
      console.log(`⏭️  Skipped: ${skippedCount}`);
    }
    if (errorCount > 0) {
      console.log(`❌ Errors: ${errorCount}`);
    }
  } catch (err) {
    error("Error: Failed to run upgrade command");
    if (err instanceof Error) {
      error(err.message);
    }
    process.exit(1);
  }
}
