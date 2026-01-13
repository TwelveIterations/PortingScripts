import { $ } from 'bun';

export async function hasUncommittedChanges(repoPath: string): Promise<boolean> {
  try {
    const result = await $`git -C ${repoPath} status --porcelain`.text();
    return result.trim().length > 0;
  } catch (err) {
    return false;
  }
}

export async function getUncommittedChanges(repoPath: string): Promise<string> {
  try {
    const result = await $`git -C ${repoPath} status --porcelain`.text();
    return result.trim();
  } catch (err) {
    return '';
  }
}

export async function commitChanges(repoPath: string, message: string): Promise<void> {
  try {
    await $`git -C ${repoPath} commit -m ${message}`.quiet();
  } catch (err) {
    throw new Error(`Failed to commit changes: ${err}`);
  }
}

export async function addFile(repoPath: string, file: string): Promise<void> {
  try {
    await $`git -C ${repoPath} add ${file}`.quiet();
  } catch (err) {
    throw new Error(`Failed to add file: ${err}`);
  }
}

export async function pushChanges(repoPath: string): Promise<void> {
  try {
    await $`git -C ${repoPath} push`.quiet();
  } catch (err) {
    throw new Error(`Failed to push changes: ${err}`);
  }
}

export async function getCommitsToPush(repoPath: string): Promise<string[]> {
  try {
    const result = await $`git -C ${repoPath} log @{u}..HEAD --oneline`.text();
    return result.trim().split('\n').filter(l => l.length > 0);
  } catch (err) {
    return [];
  }
}

export async function getGitStatus(repoPath: string): Promise<string> {
  try {
    const result = await $`git -C ${repoPath} status --porcelain`.text();
    return result.trim();
  } catch (err) {
    return '';
  }
}

export async function getCommitLog(repoPath: string, format: string = '%H %s'): Promise<string> {
  try {
    const result = await $`git -C ${repoPath} log --oneline --format="${format}"`.text();
    return result.trim();
  } catch (err) {
    return '';
  }
}

export async function getLastCommitMessage(repoPath: string): Promise<string> {
  try {
    const result = await $`git -C ${repoPath} log -1 --format=%s`.text();
    return result.trim();
  } catch (err) {
    return '';
  }
}

export async function pullChanges(repoPath: string): Promise<void> {
  try {
    await $`git -C ${repoPath} pull`.quiet();
  } catch (err) {
    throw new Error(`Failed to pull changes: ${err}`);
  }
}

export async function getCommitsSinceVersionTag(repoPath: string): Promise<string[]> {
  try {
    const result = await $`git -C ${repoPath} log --oneline --format=%s`.text();
    const commits = result.trim().split('\n').filter(l => l.length > 0);
    
    const versionCommitIndex = commits.findIndex(msg => msg.startsWith('Set version to '));
    if (versionCommitIndex === -1) {
      return commits;
    }
    
    return commits.slice(0, versionCommitIndex);
  } catch (err) {
    return [];
  }
}

export async function hasLocalClone(repoPath: string): Promise<boolean> {
  try {
    await $`git -C ${repoPath} rev-parse --git-dir`.quiet();
    return true;
  } catch (err) {
    return false;
  }
}

export async function applyPatch(repoPath: string, patchFilePath: string): Promise<{ success: boolean; output: string; error: string }> {
  try {
    const result = await $`git -C ${repoPath} apply --check ${patchFilePath}`.quiet();
    return { success: true, output: 'Patch applies cleanly', error: '' };
  } catch (checkError) {
    try {
      // Try to apply with 3-way merge
      const result = await $`git -C ${repoPath} apply --3way ${patchFilePath}`.text();
      return { success: true, output: result, error: '' };
    } catch (applyError) {
      return { 
        success: false, 
        output: '', 
        error: `Patch does not apply cleanly: ${applyError instanceof Error ? applyError.message : 'Unknown error'}` 
      };
    }
  }
}
