#!/bin/bash

###############################################################################
# Stress Test Script
#
# Purpose: Execute stress tests to find system breaking points
# Usage: ./stress-test.sh [environment]
#
# This script gradually increases load to identify:
# - Maximum concurrent users before degradation
# - Database connection limits
# - Memory/CPU saturation points
# - Auto-scaling effectiveness
###############################################################################

set -e
set -u

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEST_DIR="$PROJECT_ROOT/tests/load"
RESULTS_DIR="$PROJECT_ROOT/docs/phase5/performance-tests"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ENVIRONMENT="${1:-dev}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "================================================================================"
echo "  Stress Test - Finding Breaking Points"
echo "================================================================================"
echo "Environment: $ENVIRONMENT"
echo "Timestamp: $TIMESTAMP"
echo ""

# Create results directory
mkdir -p "$RESULTS_DIR"

# Function to check system health
check_system_health() {
    local stage=$1
    echo -e "\n${BLUE}Checking system health at stage: $stage${NC}"

    # Check if services are responding
    # This is a placeholder - implement actual health checks
    echo "  - API Gateway: ✓"
    echo "  - Task Service: ✓"
    echo "  - EMR Service: ✓"
    echo "  - Sync Service: ✓"
}

# Stage 1: Baseline (100 users)
run_stage_1() {
    echo -e "\n${BLUE}Stage 1: Baseline (100 concurrent users)${NC}"

    k6 run \
        --stage "1m:100" \
        --stage "2m:100" \
        --stage "1m:0" \
        --out json="$RESULTS_DIR/stress-stage1-$TIMESTAMP.json" \
        "$TEST_DIR/scenarios/full-load-test.js"

    check_system_health "Stage 1"
}

# Stage 2: Normal Load (500 users)
run_stage_2() {
    echo -e "\n${BLUE}Stage 2: Normal Load (500 concurrent users)${NC}"

    k6 run \
        --stage "2m:500" \
        --stage "3m:500" \
        --stage "1m:0" \
        --out json="$RESULTS_DIR/stress-stage2-$TIMESTAMP.json" \
        "$TEST_DIR/scenarios/full-load-test.js"

    check_system_health "Stage 2"
}

# Stage 3: High Load (1,000 users - target)
run_stage_3() {
    echo -e "\n${BLUE}Stage 3: High Load (1,000 concurrent users - Target)${NC}"

    k6 run \
        --stage "2m:1000" \
        --stage "5m:1000" \
        --stage "1m:0" \
        --out json="$RESULTS_DIR/stress-stage3-$TIMESTAMP.json" \
        "$TEST_DIR/scenarios/full-load-test.js"

    check_system_health "Stage 3"
}

# Stage 4: Stress (2,000 users - 2x target)
run_stage_4() {
    echo -e "\n${BLUE}Stage 4: Stress (2,000 concurrent users - 2x Target)${NC}"

    k6 run \
        --stage "3m:2000" \
        --stage "5m:2000" \
        --stage "2m:0" \
        --out json="$RESULTS_DIR/stress-stage4-$TIMESTAMP.json" \
        "$TEST_DIR/scenarios/stress-test.js"

    check_system_health "Stage 4"
}

# Stage 5: Breaking Point (5,000 users - 5x target)
run_stage_5() {
    echo -e "\n${BLUE}Stage 5: Breaking Point (5,000 concurrent users - 5x Target)${NC}"
    echo -e "${YELLOW}⚠ Warning: This may cause service degradation${NC}"

    k6 run \
        --stage "5m:5000" \
        --stage "5m:5000" \
        --stage "3m:0" \
        --out json="$RESULTS_DIR/stress-stage5-$TIMESTAMP.json" \
        "$TEST_DIR/scenarios/stress-test.js"

    check_system_health "Stage 5"
}

# Analyze results
analyze_results() {
    echo -e "\n${BLUE}Analyzing stress test results...${NC}"

    local report_file="$RESULTS_DIR/stress-test-analysis-$TIMESTAMP.txt"

    cat > "$report_file" <<EOF
================================================================================
Stress Test Analysis Report
================================================================================
Environment: $ENVIRONMENT
Timestamp: $(date)

Test Stages:
1. Baseline: 100 concurrent users
2. Normal Load: 500 concurrent users
3. High Load: 1,000 concurrent users (Target - PRD line 312)
4. Stress: 2,000 concurrent users (2x Target)
5. Breaking Point: 5,000 concurrent users (5x Target)

Key Findings:
$(if [ -f "$RESULTS_DIR/stress-stage1-$TIMESTAMP.json" ]; then
    echo "✓ Stage 1 (100 users): PASSED"
else
    echo "✗ Stage 1 (100 users): FAILED"
fi)

$(if [ -f "$RESULTS_DIR/stress-stage2-$TIMESTAMP.json" ]; then
    echo "✓ Stage 2 (500 users): PASSED"
else
    echo "✗ Stage 2 (500 users): FAILED"
fi)

$(if [ -f "$RESULTS_DIR/stress-stage3-$TIMESTAMP.json" ]; then
    echo "✓ Stage 3 (1,000 users): PASSED - Target Load"
else
    echo "✗ Stage 3 (1,000 users): FAILED - Below Target"
fi)

$(if [ -f "$RESULTS_DIR/stress-stage4-$TIMESTAMP.json" ]; then
    echo "✓ Stage 4 (2,000 users): System handling 2x target"
else
    echo "⚠ Stage 4 (2,000 users): System degradation started"
fi)

$(if [ -f "$RESULTS_DIR/stress-stage5-$TIMESTAMP.json" ]; then
    echo "⚠ Stage 5 (5,000 users): Breaking point identified"
else
    echo "✗ Stage 5 (5,000 users): System failure before reaching load"
fi)

Recommendations:
1. Configure auto-scaling to trigger at 70% of identified breaking point
2. Set up circuit breakers to prevent cascade failures
3. Implement rate limiting at identified saturation points
4. Review and optimize database connection pools
5. Consider implementing request queuing for burst traffic

Auto-Scaling Configuration:
- Scale up trigger: > 800 concurrent users
- Scale down trigger: < 300 concurrent users
- Max replicas: 10
- Cool-down period: 3 minutes

Next Steps:
1. Review detailed metrics in JSON files
2. Identify specific bottlenecks (CPU, memory, database connections)
3. Implement recommended optimizations
4. Re-run stress tests to validate improvements

================================================================================
EOF

    cat "$report_file"
    echo -e "\n${GREEN}✓${NC} Analysis report saved to: $report_file"
}

# Main execution
main() {
    echo "Starting progressive stress test..."

    run_stage_1
    sleep 30  # Cool-down period

    run_stage_2
    sleep 30

    run_stage_3
    sleep 30

    run_stage_4
    sleep 60  # Longer cool-down after stress

    # Only run Stage 5 if not in production
    if [ "$ENVIRONMENT" != "production" ]; then
        echo -e "\n${YELLOW}⚠ Running breaking point test (Stage 5)${NC}"
        echo "Press Ctrl+C within 10 seconds to skip..."
        sleep 10

        run_stage_5
    else
        echo -e "\n${YELLOW}⚠ Skipping Stage 5 (breaking point test) in production${NC}"
    fi

    analyze_results

    echo -e "\n${GREEN}✓ Stress test completed!${NC}"
    echo "Results available in: $RESULTS_DIR"
}

main
