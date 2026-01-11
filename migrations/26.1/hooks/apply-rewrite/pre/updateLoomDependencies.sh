#! /bin/bash

set -euo pipefail

echo "Updating Loom dependency configuration to unobfuscated variants..."

find . -name "*.gradle" | while read -r gradle_file; do
    sed -i 's/modImplementation(/implementation(/g' "$gradle_file"
    sed -i 's/modApi(/api(/g' "$gradle_file"
    sed -i 's/modRuntimeOnly(/runtimeOnly(/g' "$gradle_file"
    sed -i 's/modCompileOnly(/compileOnly(/g' "$gradle_file"
    sed -i 's/modLocalRuntime(/localRuntime(/g' "$gradle_file"
    echo "Processed: $gradle_file"
    git add "$gradle_file"
done

git commit -m "Update Loom dependency configuration"
git push origin $HOOKS_BRANCH

echo "Done"

