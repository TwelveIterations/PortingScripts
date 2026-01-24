import { z } from "zod";
import type { VersionInfo, VersionInfoAdapter } from ".";
import { fetchJson } from "./fetch";

export const MinecraftAdapterConfigSchema = z.object({
    source: z.url().default("https://launchermeta.mojang.com/mc/game/version_manifest.json"),
    stage: z.enum(["release", "rc", "pre", "snapshot"]).default("release"),
});
export type MinecraftAdapterConfig = z.infer<typeof MinecraftAdapterConfigSchema>;

const MinecraftVersionManifestSchema = z.object({
    latest: z.object({
        release: z.string(),
        snapshot: z.string(),
    }),
    versions: z.array(
        z.object({
            id: z.string(),
            type: z.string(),
            url: z.string(),
            time: z.string(),
            releaseTime: z.string(),
        })
    ),
});

/**
 * Determine the stage of a Minecraft version based on its id and type.
 */
function getVersionStage(id: string, type: string): string {
    if (type === "release") {
        return "release";
    }
    if (id.includes("-rc")) {
        return "rc";
    }
    if (id.includes("-pre")) {
        return "pre";
    }
    return "snapshot";
}

/**
 * Create a VersionInfoAdapter for the given Minecraft adapter configuration.
 *
 * @param config - Adapter configuration describing the Minecraft version manifest; `source` is the URL to fetch the manifest from and `stage` filters which version types to consider
 * @returns A VersionInfoAdapter whose `getLatestVersion` method returns the latest matching version info or `undefined` if no matching versions are found or an error occurs
 */
export default function minecraftAdapter(config?: MinecraftAdapterConfig): VersionInfoAdapter {
    config = MinecraftAdapterConfigSchema.parse(config || {});
    return {
        async getLatestVersion(branch?: string): Promise<VersionInfo | undefined> {
            const json = await fetchJson(config.source);
            if (!json) {
                return undefined;
            }

            let manifest;
            try {
                manifest = await MinecraftVersionManifestSchema.parseAsync(json);
            } catch (error) {
                console.error("Minecraft parse error:", error);
                return undefined;
            }

            const stage = config.stage;

            // Apply branch filtering if specified
            let filteredVersions: VersionInfo[] = [];

            if (stage === "release") {
                const releaseId = manifest.latest.release;
                const releaseVersion = manifest.versions.find((v) => v.id === releaseId);
                if (releaseVersion) {
                    const versionInfo = {
                        artifact: "minecraft",
                        version: releaseId,
                        stage: "release",
                        minecraftVersion: releaseId,
                    };
                    filteredVersions.push(versionInfo);
                }
            } else if (stage === "snapshot") {
                // For snapshot stage, use latest.snapshot directly
                const snapshotId = manifest.latest.snapshot;
                const snapshotVersion = manifest.versions.find((v) => v.id === snapshotId);
                if (snapshotVersion) {
                    const actualStage = getVersionStage(snapshotId, snapshotVersion.type);
                    const versionInfo = {
                        artifact: "minecraft",
                        version: snapshotId,
                        stage: actualStage,
                        minecraftVersion: snapshotId,
                    };
                    filteredVersions.push(versionInfo);
                }
            } else {
                // For rc/pre stages, find all versions matching that stage
                const matchingVersions = manifest.versions
                    .filter((v) => {
                        const versionStage = getVersionStage(v.id, v.type);
                        return versionStage === stage;
                    })
                    .map((v) => ({
                        artifact: "minecraft",
                        version: v.id,
                        stage,
                        minecraftVersion: v.id,
                    }));
                filteredVersions.push(...matchingVersions);
            }

            // Apply branch filtering if specified
            if (branch) {
                filteredVersions = filteredVersions.filter((version) => 
                    version.minecraftVersion.startsWith(branch)
                );
            }

            if (filteredVersions.length === 0) {
                return undefined;
            }

            // Return the latest version (sorted by release time)
            return filteredVersions.sort((a, b) => {
                const versionA = manifest.versions.find(v => v.id === a.version);
                const versionB = manifest.versions.find(v => v.id === b.version);
                const timeA = versionA?.releaseTime || "";
                const timeB = versionB?.releaseTime || "";
                return timeB.localeCompare(timeA); // Sort descending (newest first)
            })[0];
        },
    };
}
