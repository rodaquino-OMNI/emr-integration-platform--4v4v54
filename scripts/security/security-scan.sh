#!/bin/bash
# EMR Integration Platform - Comprehensive Security Scanning Script
# Version: 1.0.0
# Purpose: Run Trivy and Snyk scans on Docker containers and dependencies

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCAN_RESULTS_DIR="$PROJECT_ROOT/security-reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create results directory
mkdir -p "$SCAN_RESULTS_DIR"

echo -e "${GREEN}=== EMR Integration Platform Security Scan ===${NC}"
echo "Starting security scan at $(date)"
echo "Results will be saved to: $SCAN_RESULTS_DIR"

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to install Trivy if not present
install_trivy() {
    echo -e "${YELLOW}Installing Trivy...${NC}"
    curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
}

# Function to install Snyk if not present
install_snyk() {
    echo -e "${YELLOW}Installing Snyk...${NC}"
    npm install -g snyk
}

# Check for required tools
if ! command_exists trivy; then
    echo -e "${YELLOW}Trivy not found.${NC}"
    read -p "Install Trivy? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        install_trivy
    else
        echo -e "${RED}Trivy is required for container scanning. Exiting.${NC}"
        exit 1
    fi
fi

if ! command_exists snyk; then
    echo -e "${YELLOW}Snyk not found.${NC}"
    read -p "Install Snyk? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        install_snyk
    else
        echo -e "${YELLOW}Snyk not installed. Skipping dependency scanning.${NC}"
        SKIP_SNYK=true
    fi
fi

echo -e "\n${GREEN}1. Scanning Docker Images with Trivy${NC}"
echo "====================================="

# Build Docker images if needed
cd "$PROJECT_ROOT/src/backend"
echo "Building Docker images..."
docker-compose build --no-cache

# Scan each service's Docker image
SERVICES=("api-gateway" "task-service" "emr-service" "sync-service" "handover-service")

for SERVICE in "${SERVICES[@]}"; do
    echo -e "\n${YELLOW}Scanning $SERVICE...${NC}"
    IMAGE="emrtask/${SERVICE}:latest"

    # Scan for vulnerabilities
    trivy image \
        --severity HIGH,CRITICAL \
        --format json \
        --output "$SCAN_RESULTS_DIR/trivy-${SERVICE}-${TIMESTAMP}.json" \
        "$IMAGE"

    # Generate human-readable report
    trivy image \
        --severity HIGH,CRITICAL \
        --format table \
        "$IMAGE" | tee "$SCAN_RESULTS_DIR/trivy-${SERVICE}-${TIMESTAMP}.txt"

    # Check for secrets in image
    trivy image \
        --scanners secret \
        --format json \
        --output "$SCAN_RESULTS_DIR/trivy-secrets-${SERVICE}-${TIMESTAMP}.json" \
        "$IMAGE"
done

echo -e "\n${GREEN}2. Scanning Base Images${NC}"
echo "========================"

BASE_IMAGES=("postgres:14-alpine" "redis:7-alpine" "confluentinc/cp-kafka:7.3.0")

for IMAGE in "${BASE_IMAGES[@]}"; do
    echo -e "\n${YELLOW}Scanning $IMAGE...${NC}"
    SAFE_NAME=$(echo "$IMAGE" | tr '/:' '_')

    trivy image \
        --severity HIGH,CRITICAL \
        --format json \
        --output "$SCAN_RESULTS_DIR/trivy-base-${SAFE_NAME}-${TIMESTAMP}.json" \
        "$IMAGE"
done

if [ "${SKIP_SNYK:-false}" != "true" ]; then
    echo -e "\n${GREEN}3. Scanning Dependencies with Snyk${NC}"
    echo "===================================="

    # Backend packages
    echo -e "\n${YELLOW}Scanning backend packages...${NC}"
    cd "$PROJECT_ROOT/src/backend"

    for PACKAGE in packages/*/; do
        PACKAGE_NAME=$(basename "$PACKAGE")
        echo "Scanning $PACKAGE_NAME..."

        cd "$PACKAGE"
        if [ -f "package.json" ]; then
            snyk test \
                --severity-threshold=high \
                --json \
                > "$SCAN_RESULTS_DIR/snyk-${PACKAGE_NAME}-${TIMESTAMP}.json" || true
        fi
        cd ..
    done

    # Frontend
    echo -e "\n${YELLOW}Scanning frontend...${NC}"
    cd "$PROJECT_ROOT/src/web"
    snyk test \
        --severity-threshold=high \
        --json \
        > "$SCAN_RESULTS_DIR/snyk-web-${TIMESTAMP}.json" || true
fi

echo -e "\n${GREEN}4. Scanning Kubernetes Manifests${NC}"
echo "=================================="

cd "$PROJECT_ROOT/src/backend/k8s"
echo "Scanning Kubernetes configurations..."

trivy config \
    --severity HIGH,CRITICAL \
    --format json \
    --output "$SCAN_RESULTS_DIR/trivy-k8s-${TIMESTAMP}.json" \
    .

trivy config \
    --severity HIGH,CRITICAL \
    --format table \
    . | tee "$SCAN_RESULTS_DIR/trivy-k8s-${TIMESTAMP}.txt"

echo -e "\n${GREEN}5. Scanning for Infrastructure as Code Issues${NC}"
echo "=============================================="

# Scan Helm charts if they exist
if [ -d "$PROJECT_ROOT/infrastructure/helm" ]; then
    echo "Scanning Helm charts..."
    trivy config \
        --severity HIGH,CRITICAL \
        "$PROJECT_ROOT/infrastructure/helm" \
        > "$SCAN_RESULTS_DIR/trivy-helm-${TIMESTAMP}.txt"
fi

# Scan Terraform if it exists
if [ -d "$PROJECT_ROOT/infrastructure/terraform" ]; then
    echo "Scanning Terraform configurations..."
    trivy config \
        --severity HIGH,CRITICAL \
        "$PROJECT_ROOT/infrastructure/terraform" \
        > "$SCAN_RESULTS_DIR/trivy-terraform-${TIMESTAMP}.txt"
fi

echo -e "\n${GREEN}=== Security Scan Complete ===${NC}"
echo "Results saved to: $SCAN_RESULTS_DIR"
echo ""
echo "Summary of findings:"
echo "===================="

# Count HIGH and CRITICAL vulnerabilities from JSON reports
TOTAL_HIGH=0
TOTAL_CRITICAL=0

for JSON_FILE in "$SCAN_RESULTS_DIR"/trivy-*-${TIMESTAMP}.json; do
    if [ -f "$JSON_FILE" ]; then
        HIGH=$(jq '[.Results[]?.Vulnerabilities[]? | select(.Severity=="HIGH")] | length' "$JSON_FILE" 2>/dev/null || echo 0)
        CRITICAL=$(jq '[.Results[]?.Vulnerabilities[]? | select(.Severity=="CRITICAL")] | length' "$JSON_FILE" 2>/dev/null || echo 0)
        TOTAL_HIGH=$((TOTAL_HIGH + HIGH))
        TOTAL_CRITICAL=$((TOTAL_CRITICAL + CRITICAL))
    fi
done

echo -e "${RED}CRITICAL vulnerabilities: $TOTAL_CRITICAL${NC}"
echo -e "${YELLOW}HIGH vulnerabilities: $TOTAL_HIGH${NC}"

# Exit with error if critical vulnerabilities found
if [ $TOTAL_CRITICAL -gt 0 ]; then
    echo -e "\n${RED}ERROR: Critical vulnerabilities found! Review reports immediately.${NC}"
    exit 1
elif [ $TOTAL_HIGH -gt 10 ]; then
    echo -e "\n${YELLOW}WARNING: High number of HIGH severity vulnerabilities found.${NC}"
    exit 1
else
    echo -e "\n${GREEN}Security scan passed with acceptable risk level.${NC}"
    exit 0
fi
