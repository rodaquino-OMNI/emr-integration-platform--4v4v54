#!/bin/bash

###############################################################################
# Load Test Execution Script
#
# Purpose: Execute comprehensive load tests for EMR Integration Platform
# Reference: REMEDIATION_ROADMAP.md Week 15 (lines 354-371)
# Usage: ./load-test-run.sh [environment] [test-type]
#
# Examples:
#   ./load-test-run.sh dev full       # Full load test on dev
#   ./load-test-run.sh staging stress # Stress test on staging
#   ./load-test-run.sh prod all       # All tests on production
###############################################################################

set -e  # Exit on error
set -u  # Exit on undefined variable

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEST_DIR="$PROJECT_ROOT/tests/load"
RESULTS_DIR="$PROJECT_ROOT/docs/phase5/performance-tests"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="${1:-dev}"
TEST_TYPE="${2:-full}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="$RESULTS_DIR/load-test-report-$ENVIRONMENT-$TIMESTAMP.json"

# Validate environment
validate_environment() {
    case "$ENVIRONMENT" in
        dev|staging|production)
            echo -e "${GREEN}✓${NC} Environment: $ENVIRONMENT"
            ;;
        *)
            echo -e "${RED}✗${NC} Invalid environment: $ENVIRONMENT"
            echo "Valid environments: dev, staging, production"
            exit 1
            ;;
    esac
}

# Check prerequisites
check_prerequisites() {
    echo -e "\n${BLUE}Checking prerequisites...${NC}"

    # Check if k6 is installed
    if ! command -v k6 &> /dev/null; then
        echo -e "${RED}✗${NC} k6 is not installed"
        echo "Install k6: https://k6.io/docs/getting-started/installation/"
        exit 1
    fi
    echo -e "${GREEN}✓${NC} k6 installed: $(k6 version)"

    # Check if jq is installed (for JSON processing)
    if ! command -v jq &> /dev/null; then
        echo -e "${YELLOW}⚠${NC} jq is not installed (optional, for better reporting)"
    else
        echo -e "${GREEN}✓${NC} jq installed"
    fi

    # Check if test directory exists
    if [ ! -d "$TEST_DIR" ]; then
        echo -e "${RED}✗${NC} Test directory not found: $TEST_DIR"
        exit 1
    fi
    echo -e "${GREEN}✓${NC} Test directory found"

    # Create results directory if it doesn't exist
    mkdir -p "$RESULTS_DIR"
    echo -e "${GREEN}✓${NC} Results directory ready: $RESULTS_DIR"
}

# Load environment variables
load_environment() {
    echo -e "\n${BLUE}Loading environment configuration...${NC}"

    local env_file="$PROJECT_ROOT/.env.$ENVIRONMENT"
    if [ -f "$env_file" ]; then
        source "$env_file"
        echo -e "${GREEN}✓${NC} Loaded environment file: $env_file"
    else
        echo -e "${YELLOW}⚠${NC} Environment file not found: $env_file"
        echo "Using default configuration"
    fi

    export ENVIRONMENT="$ENVIRONMENT"
    export START_TIME=$(date +%s%3N)
}

# Run API performance tests
run_api_tests() {
    echo -e "\n${BLUE}Running API Performance Tests...${NC}"
    echo "Target SLA: p95 < 500ms (PRD line 309)"

    k6 run \
        --out json="$RESULTS_DIR/api-performance-$TIMESTAMP.json" \
        --summary-export="$RESULTS_DIR/api-performance-summary-$TIMESTAMP.json" \
        "$TEST_DIR/api/api-performance.js"

    local exit_code=$?
    if [ $exit_code -eq 0 ]; then
        echo -e "${GREEN}✓${NC} API performance tests passed"
    else
        echo -e "${RED}✗${NC} API performance tests failed (exit code: $exit_code)"
    fi
    return $exit_code
}

# Run EMR integration tests
run_emr_tests() {
    echo -e "\n${BLUE}Running EMR Integration Performance Tests...${NC}"
    echo "Target SLA: EMR verification < 2s (PRD line 311)"

    k6 run \
        --out json="$RESULTS_DIR/emr-integration-$TIMESTAMP.json" \
        --summary-export="$RESULTS_DIR/emr-integration-summary-$TIMESTAMP.json" \
        "$TEST_DIR/api/emr-integration.js"

    local exit_code=$?
    if [ $exit_code -eq 0 ]; then
        echo -e "${GREEN}✓${NC} EMR integration tests passed"
    else
        echo -e "${RED}✗${NC} EMR integration tests failed (exit code: $exit_code)"
    fi
    return $exit_code
}

# Run CRDT sync tests
run_sync_tests() {
    echo -e "\n${BLUE}Running CRDT Sync Performance Tests...${NC}"
    echo "Target SLA: Sync latency p95 < 500ms"

    k6 run \
        --out json="$RESULTS_DIR/sync-performance-$TIMESTAMP.json" \
        --summary-export="$RESULTS_DIR/sync-performance-summary-$TIMESTAMP.json" \
        "$TEST_DIR/api/sync-performance.js"

    local exit_code=$?
    if [ $exit_code -eq 0 ]; then
        echo -e "${GREEN}✓${NC} CRDT sync tests passed"
    else
        echo -e "${RED}✗${NC} CRDT sync tests failed (exit code: $exit_code)"
    fi
    return $exit_code
}

# Run WebSocket tests
run_websocket_tests() {
    echo -e "\n${BLUE}Running WebSocket Real-time Update Tests...${NC}"
    echo "Target SLA: Message latency p95 < 200ms"

    k6 run \
        --out json="$RESULTS_DIR/websocket-realtime-$TIMESTAMP.json" \
        --summary-export="$RESULTS_DIR/websocket-realtime-summary-$TIMESTAMP.json" \
        "$TEST_DIR/websocket/realtime-updates.js"

    local exit_code=$?
    if [ $exit_code -eq 0 ]; then
        echo -e "${GREEN}✓${NC} WebSocket tests passed"
    else
        echo -e "${RED}✗${NC} WebSocket tests failed (exit code: $exit_code)"
    fi
    return $exit_code
}

# Run database query tests
run_database_tests() {
    echo -e "\n${BLUE}Running Database Query Performance Tests...${NC}"
    echo "Target SLA: Query latency p95 < 500ms"

    k6 run \
        --out json="$RESULTS_DIR/database-query-$TIMESTAMP.json" \
        --summary-export="$RESULTS_DIR/database-query-summary-$TIMESTAMP.json" \
        "$TEST_DIR/database/query-performance.js"

    local exit_code=$?
    if [ $exit_code -eq 0 ]; then
        echo -e "${GREEN}✓${NC} Database query tests passed"
    else
        echo -e "${RED}✗${NC} Database query tests failed (exit code: $exit_code)"
    fi
    return $exit_code
}

# Run full load test
run_full_load_test() {
    echo -e "\n${BLUE}Running Full Load Test...${NC}"
    echo "Target: 1,000 concurrent users with 10,000 active tasks (Roadmap Week 15)"

    k6 run \
        --out json="$RESULTS_DIR/full-load-test-$TIMESTAMP.json" \
        --summary-export="$RESULTS_DIR/full-load-test-summary-$TIMESTAMP.json" \
        "$TEST_DIR/scenarios/full-load-test.js"

    local exit_code=$?
    if [ $exit_code -eq 0 ]; then
        echo -e "${GREEN}✓${NC} Full load test passed"
    else
        echo -e "${RED}✗${NC} Full load test failed (exit code: $exit_code)"
    fi
    return $exit_code
}

# Run stress test
run_stress_test() {
    echo -e "\n${BLUE}Running Stress Test...${NC}"
    echo "Target: Test system breaking point (5x normal load)"

    k6 run \
        --out json="$RESULTS_DIR/stress-test-$TIMESTAMP.json" \
        --summary-export="$RESULTS_DIR/stress-test-summary-$TIMESTAMP.json" \
        "$TEST_DIR/scenarios/stress-test.js"

    local exit_code=$?
    if [ $exit_code -eq 0 ]; then
        echo -e "${GREEN}✓${NC} Stress test passed"
    else
        echo -e "${YELLOW}⚠${NC} Stress test revealed system limits (exit code: $exit_code)"
    fi
    return $exit_code
}

# Run all tests
run_all_tests() {
    echo -e "\n${BLUE}Running All Performance Tests...${NC}"

    local failed_tests=0

    run_api_tests || ((failed_tests++))
    run_emr_tests || ((failed_tests++))
    run_sync_tests || ((failed_tests++))
    run_websocket_tests || ((failed_tests++))
    run_database_tests || ((failed_tests++))
    run_full_load_test || ((failed_tests++))
    run_stress_test || ((failed_tests++))

    if [ $failed_tests -eq 0 ]; then
        echo -e "\n${GREEN}✓ All tests passed!${NC}"
        return 0
    else
        echo -e "\n${RED}✗ $failed_tests test(s) failed${NC}"
        return 1
    fi
}

# Generate summary report
generate_summary() {
    echo -e "\n${BLUE}Generating Summary Report...${NC}"

    local summary_file="$RESULTS_DIR/test-summary-$ENVIRONMENT-$TIMESTAMP.txt"

    cat > "$summary_file" <<EOF
================================================================================
Load Test Summary Report
================================================================================
Environment: $ENVIRONMENT
Test Type: $TEST_TYPE
Timestamp: $(date)
Duration: $(($(date +%s) - START_TIME / 1000)) seconds

Results Directory: $RESULTS_DIR

SLA Requirements (PRD):
- API Response Time p95: < 500ms (PRD line 309)
- Task Operations p95: < 1s (PRD line 310)
- EMR Verification p95: < 2s (PRD line 311)
- Concurrent Users: 10,000 (PRD line 312)
- Success Rate: > 99.9% (PRD line 369)

Test Results:
$(ls -lh "$RESULTS_DIR"/*-$TIMESTAMP.json 2>/dev/null | awk '{print "  " $9}' || echo "  No results found")

Next Steps:
1. Review detailed results in: $RESULTS_DIR
2. Run performance-report.sh to generate HTML report
3. Compare against baseline metrics
4. Identify optimization opportunities

================================================================================
EOF

    cat "$summary_file"
    echo -e "${GREEN}✓${NC} Summary saved to: $summary_file"
}

# Main execution
main() {
    echo "================================================================================"
    echo "  EMR Integration Platform - Load Test Execution"
    echo "  Phase 5 - Week 15 Performance & Load Testing"
    echo "================================================================================"

    validate_environment
    check_prerequisites
    load_environment

    local test_result=0

    case "$TEST_TYPE" in
        api)
            run_api_tests || test_result=$?
            ;;
        emr)
            run_emr_tests || test_result=$?
            ;;
        sync)
            run_sync_tests || test_result=$?
            ;;
        websocket)
            run_websocket_tests || test_result=$?
            ;;
        database)
            run_database_tests || test_result=$?
            ;;
        full)
            run_full_load_test || test_result=$?
            ;;
        stress)
            run_stress_test || test_result=$?
            ;;
        all)
            run_all_tests || test_result=$?
            ;;
        *)
            echo -e "${RED}✗${NC} Invalid test type: $TEST_TYPE"
            echo "Valid types: api, emr, sync, websocket, database, full, stress, all"
            exit 1
            ;;
    esac

    generate_summary

    if [ $test_result -eq 0 ]; then
        echo -e "\n${GREEN}✓ Load testing completed successfully!${NC}"
    else
        echo -e "\n${YELLOW}⚠ Load testing completed with issues (exit code: $test_result)${NC}"
    fi

    exit $test_result
}

# Run main function
main
