#!/bin/bash
# Script to fix process.env.VAR access to process.env['VAR']

cd /Users/rodrigo/claude-projects/Beira-Leito/emr-integration-platform--4v4v54/src/backend

FILES=(
  "packages/api-gateway/src/middleware/auth.middleware.ts"
  "packages/api-gateway/src/config/index.ts"
  "packages/api-gateway/src/server.ts"
  "packages/api-gateway/src/routes/index.ts"
  "packages/task-service/src/config/index.ts"
  "packages/task-service/src/index.ts"
  "packages/handover-service/src/index.ts"
  "packages/sync-service/src/config/index.ts"
  "packages/sync-service/src/index.ts"
  "packages/emr-service/src/config/hl7.config.ts"
  "packages/emr-service/src/adapters/epic.adapter.ts"
  "packages/emr-service/src/index.ts"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "Fixing $file..."
    # Use perl for more reliable regex replacement
    # Converts process.env.VAR_NAME to process.env['VAR_NAME']
    perl -i -pe 's/process\.env\.([A-Z_][A-Z0-9_]*)/process.env[\x27$1\x27]/g' "$file"
  fi
done

echo "Done! All process.env access patterns fixed."
