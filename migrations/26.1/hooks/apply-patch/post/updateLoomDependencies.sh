#! /bin/bash

set -euo pipefail

echo "Updating Loom dependency configuration to unobfuscated variants..."

find . -type f -name "*.gradle" | while read -r gradle_file; do
    sed -i 's/\bmodImplementation\b/implementation/g' "$gradle_file"
    sed -i 's/\bmodApi\b/api/g' "$gradle_file"
    sed -i 's/\bmodRuntimeOnly\b/runtimeOnly/g' "$gradle_file"
    sed -i 's/\bmodCompileOnly\b/compileOnly/g' "$gradle_file"
    sed -i 's/\bmodLocalRuntime\b/localRuntime/g' "$gradle_file"
    
    echo "Processed: $gradle_file"
    git add "$gradle_file"
done

if ! git diff --cached --quiet; then
    git commit -m "Update Loom dependency configuration"
    git push origin $HOOKS_BRANCH
fi

echo "Done"

