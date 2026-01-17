import { z } from "zod";
import { compareVersions, getEmbeddedMinecraftVersion, parseVersion } from "./utils";
import type { VersionInfo, VersionInfoAdapter } from ".";
import { fetchJson, fetchText } from "./fetch";

export const NeoForgeAdapterConfigSchema = z.object({
    source: z.url().default("https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge"),
    stage: z.string().optional(),
});
export type NeoForgeAdapterConfig = z.infer<typeof NeoForgeAdapterConfigSchema>;

const NEOFORGE_MAVEN_BASE = "https://maven.neoforged.net/releases/net/neoforged/neoforge";

const NeoForgeReleasesResponseSchema = z.object({
    isSnapshot: z.boolean(), // unused, but part of the remote response
    versions: z.array(z.string()),
});

/**
 * Build the changelog URL for a NeoForge version.
 * 
 * @param version - The NeoForge version string
 * @returns The encoded changelog URL
 */
function buildChangelogUrl(version: string): string {
    const encodedVersion = encodeURIComponent(version);
    return `${NEOFORGE_MAVEN_BASE}/${encodedVersion}/neoforge-${encodedVersion}-changelog.txt`;
}

/**
 * Create a VersionInfoAdapter configured to fetch and resolve NeoForge release versions according to the provided adapter configuration.
 *
 * @param config - Configuration for the adapter; `config.source` is the NeoForge releases URL and `config.stage` (if present) filters which release stages are considered.
 * @returns A VersionInfoAdapter whose `getLatestVersion` method yields the latest matching release info object ({ version, stage, minecraftVersion }) or `undefined` if no matching release is found or an error occurs.
 */
export default function neoforgeAdapter(config: NeoForgeAdapterConfig): VersionInfoAdapter {
    return {
        async getLatestVersion(branch?: string) {
            const json = await fetchJson(config.source);
            if (!json) {
                return undefined;
            }

            let releases;
            try {
                releases = await NeoForgeReleasesResponseSchema.parseAsync(json);
            } catch (error) {
                console.error("NeoForge parse error:", error);
                return undefined;
            }
            const expandedVersions = releases.versions.map((version) => {
                const parsed = parseVersion(version);
                if (!parsed) {
                    return {
                        artifact: "neoforge",
                        version,
                        stage: "release",
                        minecraftVersion: "unknown"
                    };
                }

                const minecraftVersion = getEmbeddedMinecraftVersion(parsed) ?? "unknown";
                const stage: string = parsed.stage ?? "release";
                return {
                    artifact: "neoforge",
                    version: parsed.version,
                    stage,
                    minecraftVersion,
                };
            });
            let filteredVersions = expandedVersions.filter(
                (version) => !config.stage || config.stage === version.stage
            );

            // Apply branch filtering if specified
            if (branch) {
                filteredVersions = filteredVersions.filter((version) => version.minecraftVersion.startsWith(branch));
            }

            return filteredVersions.sort((a, b) => compareVersions(a.version, b.version)).pop();
        },
        async getChangelog(version: VersionInfo) {
            const url = buildChangelogUrl(version.version);
            const changelog = await fetchText(url);
            if (!changelog) {
                return undefined;
            }
            return { changelog, url };
        },
    };
}
