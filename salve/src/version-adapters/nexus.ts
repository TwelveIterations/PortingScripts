import { z } from "zod";
import { compareVersions, getEmbeddedMinecraftVersion } from "./utils";
import type { VersionInfoAdapter, VersionInfo } from ".";
import { fetchJson } from "./fetch";

export const MinecraftVersionStrategySchema = z.enum(["embedded"]).default("embedded");
export type MinecraftVersionStrategy = z.infer<typeof MinecraftVersionStrategySchema>;

export const NexusAdapterConfigSchema = z.object({
    source: z.url(),
    repository: z.string().default("maven-releases"),
    groupId: z.string(),
    artifactId: z.string(),
    minecraftVersionStrategy: MinecraftVersionStrategySchema,
});
export type NexusAdapterConfig = z.infer<typeof NexusAdapterConfigSchema>;

const NexusSearchResponseSchema = z.object({
    items: z.array(z.object({
        version: z.string(),
    })),
});

/**
 * Create a VersionInfoAdapter configured to fetch and resolve versions from a Nexus repository.
 *
 * @param config - Configuration for the adapter; `config.source` is the Nexus base URL, `config.groupId` and `config.artifactId` identify the artifact, and `config.minecraftVersionStrategy` determines how to derive the Minecraft version.
 * @returns A VersionInfoAdapter whose `getLatestVersion` method yields the latest matching release info object ({ artifact, version, stage, minecraftVersion }) or `undefined` if no matching release is found or an error occurs.
 */
export default function nexusAdapter(config: NexusAdapterConfig): VersionInfoAdapter {
    return {
        async getLatestVersion(branch?: string) {
            const url = new URL("/service/rest/v1/search", config.source);
            url.searchParams.set("repository", config.repository);
            url.searchParams.set("group", config.groupId);
            url.searchParams.set("name", config.artifactId);
            url.searchParams.set("sort", "version");

            const json = await fetchJson(url);
            if (!json) {
                return undefined;
            }

            let releases;
            try {
                releases = await NexusSearchResponseSchema.parseAsync(json);
            } catch (error) {
                console.error("Nexus parse error:", error);
                return undefined;
            }

            if (!releases.items || releases.items.length === 0) {
                return undefined;
            }

            const expandedVersions = releases.items.map((item) => {
                let minecraftVersion: string | undefined;

                if (config.minecraftVersionStrategy === "embedded") {
                    minecraftVersion = getEmbeddedMinecraftVersion(item.version);
                }

                return {
                    artifact: config.artifactId,
                    version: item.version,  
                    stage: "release" as const,
                    minecraftVersion: minecraftVersion ?? "unknown",
                };
            });

            let filteredVersions = expandedVersions;

            // Apply branch filtering if specified
            if (branch) {
                filteredVersions = filteredVersions.filter((version) => 
                    version.minecraftVersion === "unknown" || version.minecraftVersion.startsWith(branch)
                );
            }

            if (filteredVersions.length === 0) {
                return undefined;
            }

            return filteredVersions.sort((a, b) => compareVersions(a.version, b.version)).pop();
        },
    };
}
