#!/bin/bash

# OpenAPI Validation Script for EMR Task Integration Platform
# This script validates the OpenAPI 3.0 specification and generates bundled output

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "======================================"
echo "OpenAPI Specification Validation"
echo "======================================"
echo ""

# Check if required tools are installed
command -v npx >/dev/null 2>&1 || {
  echo -e "${RED}Error: npx is not installed.${NC}" >&2
  echo "Please install Node.js and npm first."
  exit 1
}

# Navigate to project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

echo -e "${YELLOW}Step 1: Linting OpenAPI specification...${NC}"
if npx @redocly/cli lint docs/api/openapi.yaml --config docs/api/.redocly.yaml 2>/dev/null || npx @redocly/cli lint docs/api/openapi.yaml; then
  echo -e "${GREEN}✓ OpenAPI specification is valid${NC}"
else
  echo -e "${RED}✗ OpenAPI specification has errors${NC}"
  exit 1
fi

echo ""
echo -e "${YELLOW}Step 2: Bundling OpenAPI specification...${NC}"
mkdir -p dist/api
if npx @redocly/cli bundle docs/api/openapi.yaml -o dist/api/openapi-bundled.yaml; then
  echo -e "${GREEN}✓ Bundled specification created: dist/api/openapi-bundled.yaml${NC}"
else
  echo -e "${RED}✗ Failed to bundle specification${NC}"
  exit 1
fi

echo ""
echo -e "${YELLOW}Step 3: Generating statistics...${NC}"
npx @redocly/cli stats docs/api/openapi.yaml || true

echo ""
echo -e "${YELLOW}Step 4: Generating HTML documentation (optional)...${NC}"
if npx @redocly/cli build-docs docs/api/openapi.yaml -o dist/api/index.html 2>/dev/null; then
  echo -e "${GREEN}✓ HTML documentation generated: dist/api/index.html${NC}"
else
  echo -e "${YELLOW}⚠ HTML documentation generation skipped (redocly build-docs not available)${NC}"
fi

echo ""
echo "======================================"
echo -e "${GREEN}Validation Complete!${NC}"
echo "======================================"
echo ""
echo "Generated files:"
echo "  - dist/api/openapi-bundled.yaml"
echo "  - dist/api/index.html (if available)"
echo ""
echo "To preview the documentation, run:"
echo "  npm run docs:preview"
echo ""
