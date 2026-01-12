import { getConfigPath } from "../config";
import { existsSync, writeFileSync } from "fs";
import launchEditor from "launch-editor";
import { error, info } from "../utils/console";

export async function config() {
  const configPath = getConfigPath();

  // Create config file if it doesn't exist
  if (!existsSync(configPath)) {
    const defaultConfig = {
      excludedRepositories: [],
      organization: "",
      team: "",
      repositoriesPath: "",
      ide: "intellij-idea-community",
    };

    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    info(`Created default config file at ${configPath}`);
  }

  info(
    `Opening config file in editor. Alternatively, you can manually edit the file at: ${configPath}`
  );
  launchEditor(configPath, undefined, (fileName, errorMessage) => {
    error(`Error opening config file ${fileName}: ${errorMessage}`);
  });
}
