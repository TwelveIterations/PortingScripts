import { z } from "zod";
import { compareVersions } from "./utils";
import type { VersionInfo, VersionInfoAdapter } from ".";
import { fetchJson, fetchText } from "./fetch";

export const ForgeAdapterConfigSchema = z.object({
    source: z.url().default("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json"),
});
export type ForgeAdapterConfig = z.infer<typeof ForgeAdapterConfigSchema>;

const FORGE_MAVEN_BASE = "https://maven.minecraftforge.net/net/minecraftforge/forge";

/**
 * Build the changelog URL for a Forge version.
 */
function buildChangelogUrl(minecraftVersion: string, forgeVersion: string): string {
    const fullVersion = `${encodeURIComponent(minecraftVersion)}-${encodeURIComponent(forgeVersion)}`;
    return `${FORGE_MAVEN_BASE}/${fullVersion}/forge-${fullVersion}-changelog.txt`;
}

const ForgePromosResponseSchema = z.object({
    homepage: z.string(),
    promos: z.record(z.string(), z.string()),
});

/**
 * Create a VersionInfoAdapter configured to fetch and resolve Forge release versions according to the provided adapter configuration.
 *
 * @param config - Configuration for the adapter; `config.source` is the Forge promotions URL.
 * @returns A VersionInfoAdapter whose `getLatestVersion` method yields the latest matching release info object ({ version, stage, minecraftVersion }) or `undefined` if no matching release is found or an error occurs.
 */
export default function forgeAdapter(config: ForgeAdapterConfig): VersionInfoAdapter {
    return {
        async getLatestVersion(branch?: string) {
            const json = await fetchJson(config.source);
            if (!json) {
                return undefined;
            }

            let promos;
            try {
                promos = await ForgePromosResponseSchema.parseAsync(json);
            } catch (error) {
                console.error("Forge parse error:", error);
                return undefined;
            }

            let latestVersions = Object.entries(promos.promos)
                .filter(([key]) => key.endsWith("-latest"))
                .map(([key, version]) => {
                    const minecraftVersion = key.replace(/-latest$/, "");
                    return {
                        artifact: "forge",
                        version: version as string,
                        stage: "release",
                        minecraftVersion,
                    };
                });

            // Apply branch filtering if specified
            if (branch) {
                latestVersions = latestVersions.filter((version) => 
                    version.minecraftVersion.startsWith(branch)
                );
            }

            if (latestVersions.length === 0) {
                return undefined;
            }

            return latestVersions.reduce((latest, current) =>
                compareVersions(current.version, latest.version) > 0 ? current : latest
            );
        },
        async getChangelog(version: VersionInfo) {
            if (!version.minecraftVersion) {
                return undefined;
            }
            const url = buildChangelogUrl(version.minecraftVersion, version.version);
            const changelog = await fetchText(url);
            if (!changelog) {
                return undefined;
            }
            return { changelog, url };
        },
    };
}
