export type ChangelogInfo = {
    changelog: string;
    url?: string;
}

export type VersionInfo = {
    artifact: string;
    version: string;
    stage: string;
    minecraftVersion: string;
    changelog?: ChangelogInfo;
}

export interface TriggerContext {
    triggerId: string;
}

export interface VersionInfoAdapter {
    getLatestVersion(branch?: string): Promise<VersionInfo | undefined>;
    getChangelog?(version: VersionInfo): Promise<ChangelogInfo | undefined>;
}