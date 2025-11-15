#!/bin/bash
# Script to fix all tsconfig.json module settings

cd /Users/rodrigo/claude-projects/Beira-Leito/emr-integration-platform--4v4v54/src/backend

# Use bundler moduleResolution which works better with paths and is more flexible
for file in packages/*/tsconfig.json; do
  if [ -f "$file" ]; then
    echo "Fixing $file..."
    # Remove Node16 module setting if present
    perl -i -pe 's/"module":\s*"Node16",?\s*\n//g' "$file"
    # Keep node16 moduleResolution as it's valid
  fi
done

echo "Done! All tsconfig files fixed."
