import { z } from "zod";
import { compareVersions, parseVersion, type ParsedVersion } from "./utils";
import { type VersionInfo, type VersionInfoAdapter } from ".";
import { fetchJson, fetchText } from "./fetch";

export const FabricAdapterConfigSchema = z.object({
    source: z.url().default("https://maven.fabricmc.net/jdlist.txt").optional(),
    artifact: z.string(),
});
export type FabricAdapterConfig = z.infer<typeof FabricAdapterConfigSchema>;

const FABRIC_API_GITHUB_RELEASES = "https://api.github.com/repos/FabricMC/fabric/releases/tags";

/**
 * Build the GitHub release API URL for a Fabric API version.
 */
function buildGitHubReleaseUrl(version: string): string {
    return `${FABRIC_API_GITHUB_RELEASES}/${version}`;
}

/**
 * Create a VersionInfoAdapter for the given Fabric adapter configuration.
 *
 * @param config - Adapter configuration describing the Fabric feed; `source` is the URL to fetch the list from and `artifact` is the artifact name used as the prefix to identify versions
 * @returns A VersionInfoAdapter whose `getLatestVersion` method returns the latest matching version info (an object with `version`, `stage`, and optional `minecraftVersion`) or `undefined` if no matching versions are found or an error occurs
 */
export default function fabricAdapter(config?: FabricAdapterConfig): VersionInfoAdapter {
    config = FabricAdapterConfigSchema.parse(config ?? {});
    return {
        async getLatestVersion(branch?: string) {
            const jdlist = await fetchText(config.source!);
            if (!jdlist) {
                return undefined;
            }
            const versions = jdlist
                .split("\n")
                .filter((line) => line.startsWith(config.artifact + "-"))
                .map((line) => line.substring(config.artifact.length + 1));
            const expandedVersions = versions.map((version) => {
                const parsed = parseVersion(version) ?? ({ version } as ParsedVersion);
                let minecraftVersion = "unknown"
                if (config.artifact === "fabric-api") {
                    minecraftVersion = parsed.build ?? "unknown"
                } else if (config.artifact === "fabric-loader") {
                    minecraftVersion = "any"
                }
                const stage: string = parsed.stage ?? "release";
                return {
                    artifact: config.artifact,
                    version: parsed.version,
                    stage,
                    minecraftVersion,
                };
            });
            if (expandedVersions.length === 0) {
                return undefined;
            }

            let filteredVersions = expandedVersions;

            // Apply branch filtering if specified
            if (branch) {
                filteredVersions = filteredVersions.filter((version) => 
                    version.minecraftVersion === "any" || version.minecraftVersion.startsWith(branch)
                );
            }

            if (filteredVersions.length === 0) {
                return undefined;
            }

            return filteredVersions.sort((a, b) => compareVersions(a.version, b.version)).pop();
        },
        async getChangelog(version: VersionInfo) {
            if (config.artifact !== "fabric-api") {
                return undefined;
            }
            const apiUrl = buildGitHubReleaseUrl(version.version);
            const release = await fetchJson<{ body?: string; html_url?: string }>(apiUrl);
            if (!release || !release.body) {
                return undefined;
            }
            return { changelog: release.body, url: release.html_url };
        },
    };
}