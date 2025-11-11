#!/bin/bash
# EMR Integration Platform - Secrets Scanning Script
# Version: 1.0.0
# Purpose: Verify no hardcoded secrets exist in codebase

set -euo pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCAN_RESULTS_DIR="$PROJECT_ROOT/security-reports/secrets-scans"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$SCAN_RESULTS_DIR"

echo -e "${GREEN}=== Secrets Detection Scan ===${NC}"
echo "Starting scan at $(date)"

# Install gitleaks if not present
if ! command -v gitleaks &> /dev/null; then
    echo -e "${YELLOW}gitleaks not found. Installing...${NC}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install gitleaks
    else
        wget https://github.com/gitleaks/gitleaks/releases/download/v8.18.0/gitleaks_8.18.0_linux_x64.tar.gz
        tar -xzf gitleaks_8.18.0_linux_x64.tar.gz
        sudo mv gitleaks /usr/local/bin/
        rm gitleaks_8.18.0_linux_x64.tar.gz
    fi
fi

echo -e "\n${GREEN}1. Scanning Current Codebase${NC}"
echo "=============================="

cd "$PROJECT_ROOT"

gitleaks detect \
    --source . \
    --report-format json \
    --report-path "$SCAN_RESULTS_DIR/gitleaks-current-${TIMESTAMP}.json" \
    --verbose || SECRETS_FOUND=true

gitleaks detect \
    --source . \
    --report-format sarif \
    --report-path "$SCAN_RESULTS_DIR/gitleaks-current-${TIMESTAMP}.sarif" \
    --no-color || true

echo -e "\n${GREEN}2. Scanning Git History${NC}"
echo "========================"

gitleaks detect \
    --source . \
    --log-opts="--all" \
    --report-format json \
    --report-path "$SCAN_RESULTS_DIR/gitleaks-history-${TIMESTAMP}.json" \
    --verbose || HISTORY_SECRETS_FOUND=true

echo -e "\n${GREEN}3. Custom Pattern Scanning${NC}"
echo "==========================="

# Scan for common secret patterns
echo "Scanning for hardcoded secrets..."

PATTERNS=(
    "password.*=.*['\"].*['\"]"
    "secret.*=.*['\"].*['\"]"
    "api[_-]?key.*=.*['\"].*['\"]"
    "token.*=.*['\"].*['\"]"
    "AWS_ACCESS_KEY_ID"
    "AWS_SECRET_ACCESS_KEY"
    "POSTGRES_PASSWORD"
    "-----BEGIN (RSA |DSA )?PRIVATE KEY-----"
)

CUSTOM_REPORT="$SCAN_RESULTS_DIR/custom-patterns-${TIMESTAMP}.txt"
{
    echo "Custom Secret Pattern Scan Results"
    echo "Generated: $(date)"
    echo "==================================="
    echo ""

    for PATTERN in "${PATTERNS[@]}"; do
        echo "Searching for pattern: $PATTERN"
        grep -rn --include="*.ts" --include="*.js" --include="*.json" --include="*.yaml" --include="*.yml" \
            --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git \
            -E "$PATTERN" "$PROJECT_ROOT" || echo "  No matches found"
        echo ""
    done
} | tee "$CUSTOM_REPORT"

echo -e "\n${GREEN}4. Scanning Kubernetes Secrets${NC}"
echo "==============================="

K8S_SECRETS_DIR="$PROJECT_ROOT/src/backend/k8s/secrets"

if [ -d "$K8S_SECRETS_DIR" ]; then
    echo "Found Kubernetes secrets directory: $K8S_SECRETS_DIR"
    echo "WARNING: Kubernetes secrets should NOT be committed to git!"
    echo ""

    K8S_REPORT="$SCAN_RESULTS_DIR/k8s-secrets-${TIMESTAMP}.txt"
    {
        echo "Kubernetes Secrets Analysis"
        echo "============================"
        echo ""

        for SECRET_FILE in "$K8S_SECRETS_DIR"/*.yaml; do
            if [ -f "$SECRET_FILE" ]; then
                echo "File: $(basename "$SECRET_FILE")"
                echo "  Base64 Encoded Values:"

                # Extract and decode base64 values
                grep -E "^  [A-Z_]+:" "$SECRET_FILE" | while read -r LINE; do
                    KEY=$(echo "$LINE" | cut -d: -f1 | tr -d ' ')
                    VALUE=$(echo "$LINE" | cut -d: -f2 | tr -d ' ')

                    if [ -n "$VALUE" ]; then
                        DECODED=$(echo "$VALUE" | base64 -d 2>/dev/null || echo "[invalid base64]")
                        echo "    $KEY: $DECODED"
                    fi
                done
                echo ""
            fi
        done
    } | tee "$K8S_REPORT"

    echo -e "${RED}CRITICAL: Kubernetes secrets found in repository!${NC}"
    SECRETS_IN_GIT=true
fi

echo -e "\n${GREEN}5. Checking Environment Files${NC}"
echo "=============================="

ENV_FILES=$(find "$PROJECT_ROOT" -name ".env" -o -name ".env.*" -not -name ".env.example")

if [ -n "$ENV_FILES" ]; then
    echo -e "${RED}WARNING: .env files found in repository:${NC}"
    echo "$ENV_FILES"
    echo ""
    echo "These files should be in .gitignore and NOT committed."
    ENV_FILES_FOUND=true
else
    echo -e "${GREEN}No .env files found in repository (good!)${NC}"
fi

# Check if .env files are properly gitignored
echo -e "\nChecking .gitignore configuration..."
if grep -q "^\.env$" "$PROJECT_ROOT/.gitignore" 2>/dev/null; then
    echo -e "${GREEN}.env is properly gitignored${NC}"
else
    echo -e "${YELLOW}WARNING: .env not found in .gitignore${NC}"
fi

echo -e "\n${GREEN}6. Docker Compose Secrets Check${NC}"
echo "================================="

DOCKER_COMPOSE_FILE="$PROJECT_ROOT/src/backend/docker-compose.yml"

if [ -f "$DOCKER_COMPOSE_FILE" ]; then
    echo "Checking docker-compose.yml for secret references..."

    # Check for hardcoded passwords
    if grep -q "POSTGRES_PASSWORD_FILE" "$DOCKER_COMPOSE_FILE"; then
        echo -e "${GREEN}Using secret files for database password (good!)${NC}"
    else
        echo -e "${YELLOW}WARNING: Database password might be hardcoded${NC}"
    fi

    # Check CORS configuration
    if grep -q "CORS_ORIGIN=\*" "$DOCKER_COMPOSE_FILE"; then
        echo -e "${RED}CRITICAL: CORS set to wildcard (*) - security risk!${NC}"
        CORS_WILDCARD=true
    fi
fi

echo -e "\n${GREEN}=== Secrets Scan Complete ===${NC}"
echo "Results saved to: $SCAN_RESULTS_DIR"
echo ""
echo "Summary of Findings:"
echo "===================="

EXIT_CODE=0

if [ "${SECRETS_FOUND:-false}" = "true" ]; then
    echo -e "${RED}✗ Secrets found in current codebase${NC}"
    EXIT_CODE=1
else
    echo -e "${GREEN}✓ No secrets found in current codebase${NC}"
fi

if [ "${HISTORY_SECRETS_FOUND:-false}" = "true" ]; then
    echo -e "${RED}✗ Secrets found in git history${NC}"
    echo "  ACTION: Use BFG Repo-Cleaner or git filter-branch to remove"
    EXIT_CODE=1
else
    echo -e "${GREEN}✓ No secrets found in git history${NC}"
fi

if [ "${SECRETS_IN_GIT:-false}" = "true" ]; then
    echo -e "${RED}✗ Kubernetes secrets found in repository${NC}"
    echo "  ACTION: Remove secrets directory from git and use external secret management"
    EXIT_CODE=1
else
    echo -e "${GREEN}✓ No Kubernetes secrets in repository${NC}"
fi

if [ "${ENV_FILES_FOUND:-false}" = "true" ]; then
    echo -e "${YELLOW}⚠ .env files found in repository${NC}"
    echo "  ACTION: Remove from git and add to .gitignore"
fi

if [ "${CORS_WILDCARD:-false}" = "true" ]; then
    echo -e "${RED}✗ CORS wildcard configuration detected${NC}"
    echo "  ACTION: Configure specific allowed origins"
    EXIT_CODE=1
fi

if [ $EXIT_CODE -eq 0 ]; then
    echo -e "\n${GREEN}PASS: No critical secrets found${NC}"
else
    echo -e "\n${RED}FAIL: Critical security issues detected${NC}"
    echo "Review reports and take immediate action."
fi

exit $EXIT_CODE
