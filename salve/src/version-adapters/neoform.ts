import { z } from "zod";
import type { VersionInfoAdapter } from ".";
import { fetchJson } from "./fetch";

export const NeoFormAdapterConfigSchema = z.object({
    source: z.url().default("https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoform"),
    stage: z.string().optional(),
});
export type NeoFormAdapterConfig = z.infer<typeof NeoFormAdapterConfigSchema>;

const NeoFormReleasesResponseSchema = z.object({
    isSnapshot: z.boolean(),
    versions: z.array(z.string()),
});

/**
 * Parse a NeoForm version string into its components.
 * NeoForm versions are formatted as "{minecraftVersion}-{timestamp}", e.g. "1.21.5-rc1-20250320.202415"
 * The timestamp (YYYYMMDD.HHMMSS) is the actual NeoForm version.
 *
 * @param version - The full NeoForm version string
 * @returns An object with minecraftVersion, neoformVersion (timestamp), and stage; or null if parsing fails
 */
function parseNeoFormVersion(version: string) {
    // Match timestamp YYYYMMDD.HHMMSS or -snapshot-* suffix
    const timestampMatch = version.match(/(.+)-(\d{8}\.\d{6})$/);
    const snapshotMatch = version.match(/(.+)-(\d)$/);
    const suffixMatch = timestampMatch || snapshotMatch;
    if (!suffixMatch) {
        return null;
    }

    const minecraftVersion = suffixMatch[1]!;

    // Determine stage from minecraft version
    let stage = "release";
    if (minecraftVersion.includes("-rc")) {
        stage = "rc";
    } else if (minecraftVersion.includes("-pre")) {
        stage = "pre";
    } else if (snapshotMatch || /\d{2}w\d{2}[a-z]/.test(minecraftVersion)) {
        stage = "snapshot";
    }

    return {
        minecraftVersion,
        neoformVersion: version,
        stage,
    };
}

/**
 * Create a VersionInfoAdapter configured to fetch and resolve NeoForm release versions according to the provided adapter configuration.
 *
 * @param config - Configuration for the adapter; `config.source` is the NeoForm releases URL and `config.stage` (if present) filters which release stages are considered.
 * @returns A VersionInfoAdapter whose `getLatestVersion` method yields the latest matching release info object ({ version, stage, minecraftVersion }) or `undefined` if no matching release is found or an error occurs.
 */
export default function neoformAdapter(config: NeoFormAdapterConfig): VersionInfoAdapter {
    return {
        async getLatestVersion(branch?: string) {
            const json = await fetchJson(config.source);
            if (!json) {
                return undefined;
            }

            let releases;
            try {
                releases = await NeoFormReleasesResponseSchema.parseAsync(json);
            } catch (error) {
                console.error("NeoForm parse error:", error);
                return undefined;
            }

            const expandedVersions = releases.versions
                .map((version) => {
                    const parsed = parseNeoFormVersion(version);
                    if (!parsed) {
                        return null;
                    }
                    return {
                        artifact: "neoform",
                        version: parsed.neoformVersion,
                        stage: parsed.stage,
                        minecraftVersion: parsed.minecraftVersion,
                    };
                })
                .filter((v): v is NonNullable<typeof v> => v !== null);

            let filteredVersions = expandedVersions.filter(
                (version) => !config.stage || config.stage === version.stage
            );

            // Apply branch filtering if specified
            if (branch) {
                filteredVersions = filteredVersions.filter((version) => 
                    version.minecraftVersion.startsWith(branch)
                );
            }

            if (filteredVersions.length === 0) {
                return undefined;
            }

            // Sort by timestamp (lexicographic works for YYYYMMDD.HHMMSS format)
            return filteredVersions.sort((a, b) => a.version.localeCompare(b.version)).pop();
        },
    };
}
