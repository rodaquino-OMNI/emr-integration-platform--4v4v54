#!/bin/bash
# EMR Integration Platform - Dependency Audit Script
# Version: 1.0.0
# Purpose: Check npm packages for known vulnerabilities

set -euo pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
AUDIT_RESULTS_DIR="$PROJECT_ROOT/security-reports/dependency-audits"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$AUDIT_RESULTS_DIR"

echo -e "${GREEN}=== Dependency Vulnerability Audit ===${NC}"
echo "Starting audit at $(date)"

# Function to audit a package directory
audit_package() {
    local PACKAGE_DIR=$1
    local PACKAGE_NAME=$2

    echo -e "\n${YELLOW}Auditing $PACKAGE_NAME...${NC}"

    cd "$PACKAGE_DIR"

    # Run npm audit
    npm audit --json > "$AUDIT_RESULTS_DIR/${PACKAGE_NAME}-${TIMESTAMP}.json" 2>&1 || true

    # Generate readable report
    npm audit > "$AUDIT_RESULTS_DIR/${PACKAGE_NAME}-${TIMESTAMP}.txt" 2>&1 || true

    # Check for outdated packages
    npm outdated --json > "$AUDIT_RESULTS_DIR/${PACKAGE_NAME}-outdated-${TIMESTAMP}.json" 2>&1 || true

    # Parse vulnerability counts
    local HIGH_VULN=$(jq '.metadata.vulnerabilities.high // 0' "$AUDIT_RESULTS_DIR/${PACKAGE_NAME}-${TIMESTAMP}.json")
    local CRITICAL_VULN=$(jq '.metadata.vulnerabilities.critical // 0' "$AUDIT_RESULTS_DIR/${PACKAGE_NAME}-${TIMESTAMP}.json")

    echo "  Critical: $CRITICAL_VULN, High: $HIGH_VULN"

    return 0
}

# Audit backend packages
echo -e "\n${GREEN}1. Auditing Backend Packages${NC}"
echo "============================="

BACKEND_PACKAGES=(
    "$PROJECT_ROOT/src/backend/packages/api-gateway:api-gateway"
    "$PROJECT_ROOT/src/backend/packages/task-service:task-service"
    "$PROJECT_ROOT/src/backend/packages/emr-service:emr-service"
    "$PROJECT_ROOT/src/backend/packages/sync-service:sync-service"
    "$PROJECT_ROOT/src/backend/packages/handover-service:handover-service"
    "$PROJECT_ROOT/src/backend/packages/shared:shared"
)

for PACKAGE in "${BACKEND_PACKAGES[@]}"; do
    IFS=':' read -r DIR NAME <<< "$PACKAGE"
    if [ -f "$DIR/package.json" ]; then
        audit_package "$DIR" "$NAME"
    else
        echo -e "${YELLOW}  Skipping $NAME (no package.json)${NC}"
    fi
done

# Audit frontend
echo -e "\n${GREEN}2. Auditing Frontend Package${NC}"
echo "============================="

if [ -f "$PROJECT_ROOT/src/web/package.json" ]; then
    audit_package "$PROJECT_ROOT/src/web" "web"
fi

# Audit mobile apps
echo -e "\n${GREEN}3. Auditing Mobile Packages${NC}"
echo "============================="

# iOS (if using npm packages via React Native)
if [ -f "$PROJECT_ROOT/src/ios/package.json" ]; then
    audit_package "$PROJECT_ROOT/src/ios" "ios"
else
    echo -e "${YELLOW}  No iOS npm dependencies found${NC}"
fi

# Android (if using npm packages via React Native)
if [ -f "$PROJECT_ROOT/src/android/package.json" ]; then
    audit_package "$PROJECT_ROOT/src/android" "android"
else
    echo -e "${YELLOW}  No Android npm dependencies found${NC}"
fi

# Generate consolidated report
echo -e "\n${GREEN}4. Generating Consolidated Report${NC}"
echo "===================================="

REPORT_FILE="$AUDIT_RESULTS_DIR/consolidated-report-${TIMESTAMP}.txt"

{
    echo "EMR Integration Platform - Dependency Audit Report"
    echo "Generated: $(date)"
    echo "=================================================="
    echo ""

    TOTAL_CRITICAL=0
    TOTAL_HIGH=0
    TOTAL_MODERATE=0
    TOTAL_LOW=0

    for JSON_FILE in "$AUDIT_RESULTS_DIR"/*-${TIMESTAMP}.json; do
        if [ -f "$JSON_FILE" ] && [[ ! "$JSON_FILE" =~ "outdated" ]]; then
            PACKAGE_NAME=$(basename "$JSON_FILE" | sed "s/-${TIMESTAMP}.json//")

            CRITICAL=$(jq '.metadata.vulnerabilities.critical // 0' "$JSON_FILE")
            HIGH=$(jq '.metadata.vulnerabilities.high // 0' "$JSON_FILE")
            MODERATE=$(jq '.metadata.vulnerabilities.moderate // 0' "$JSON_FILE")
            LOW=$(jq '.metadata.vulnerabilities.low // 0' "$JSON_FILE")

            TOTAL_CRITICAL=$((TOTAL_CRITICAL + CRITICAL))
            TOTAL_HIGH=$((TOTAL_HIGH + HIGH))
            TOTAL_MODERATE=$((TOTAL_MODERATE + MODERATE))
            TOTAL_LOW=$((TOTAL_LOW + LOW))

            echo "$PACKAGE_NAME:"
            echo "  Critical: $CRITICAL"
            echo "  High: $HIGH"
            echo "  Moderate: $MODERATE"
            echo "  Low: $LOW"
            echo ""
        fi
    done

    echo "=================================================="
    echo "TOTAL VULNERABILITIES:"
    echo "  Critical: $TOTAL_CRITICAL"
    echo "  High: $TOTAL_HIGH"
    echo "  Moderate: $TOTAL_MODERATE"
    echo "  Low: $TOTAL_LOW"
    echo "=================================================="

} | tee "$REPORT_FILE"

echo -e "\n${GREEN}=== Audit Complete ===${NC}"
echo "Reports saved to: $AUDIT_RESULTS_DIR"

# Check vulnerability thresholds
TOTAL_CRITICAL=$(jq -s 'map(.metadata.vulnerabilities.critical // 0) | add' "$AUDIT_RESULTS_DIR"/*-${TIMESTAMP}.json 2>/dev/null || echo 0)
TOTAL_HIGH=$(jq -s 'map(.metadata.vulnerabilities.high // 0) | add' "$AUDIT_RESULTS_DIR"/*-${TIMESTAMP}.json 2>/dev/null || echo 0)

if [ "$TOTAL_CRITICAL" -gt 0 ]; then
    echo -e "\n${RED}FAIL: $TOTAL_CRITICAL critical vulnerabilities found!${NC}"
    echo "Run 'npm audit fix' in affected packages to resolve."
    exit 1
elif [ "$TOTAL_HIGH" -gt 5 ]; then
    echo -e "\n${YELLOW}WARNING: $TOTAL_HIGH high severity vulnerabilities found.${NC}"
    echo "Consider running 'npm audit fix' to address issues."
    exit 1
else
    echo -e "\n${GREEN}PASS: No critical vulnerabilities found.${NC}"
    exit 0
fi
