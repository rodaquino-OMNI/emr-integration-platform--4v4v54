#!/bin/bash
# Master Performance Testing Script
# Runs all performance tests in sequence

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="$SCRIPT_DIR/results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RUN_LOG="$RESULTS_DIR/test_run_$TIMESTAMP.log"

# Create results directory
mkdir -p "$RESULTS_DIR"

# Logging function
log() {
    local level="$1"
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    echo "[$timestamp] [$level] $message" | tee -a "$RUN_LOG"
}

# Error handler
handle_error() {
    local exit_code=$?
    local line_number=$1
    log "ERROR" "Script failed at line $line_number with exit code $exit_code"
    exit $exit_code
}

trap 'handle_error $LINENO' ERR

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}EMR Integration Platform - Performance Test Suite${NC}"
echo -e "${BLUE}================================================${NC}"
echo "Started: $(date)"
echo "Results directory: $RESULTS_DIR"
echo "================================================"

# Check prerequisites
echo -e "\n${YELLOW}Checking prerequisites...${NC}"

check_command() {
    local cmd="$1"
    local package="$2"

    if command -v "$cmd" &> /dev/null; then
        echo -e "${GREEN}✓${NC} $cmd found"
        return 0
    else
        echo -e "${YELLOW}⚠${NC}  $cmd not found (install: $package)"
        return 1
    fi
}

MISSING_DEPS=0

check_command "k6" "k6" || MISSING_DEPS=1
check_command "artillery" "npm install -g artillery" || MISSING_DEPS=1
check_command "ab" "apache2-utils or httpd-tools" || MISSING_DEPS=1
check_command "psql" "postgresql-client" || MISSING_DEPS=1
check_command "pgbench" "postgresql-contrib" || MISSING_DEPS=1

if [ $MISSING_DEPS -eq 1 ]; then
    echo -e "\n${YELLOW}Some tools are missing. Proceeding with available tools...${NC}"
fi

# Test 1: Database Benchmarks
if command -v psql &> /dev/null && command -v pgbench &> /dev/null; then
    echo -e "\n${BLUE}================================================${NC}"
    echo -e "${BLUE}Test 1: Database Performance Benchmarks${NC}"
    echo -e "${BLUE}================================================${NC}"
    log "INFO" "Starting database benchmarks"

    if [ -f "$SCRIPT_DIR/benchmark-database.sh" ]; then
        chmod +x "$SCRIPT_DIR/benchmark-database.sh"
        "$SCRIPT_DIR/benchmark-database.sh" 2>&1 | tee -a "$RUN_LOG"
        log "INFO" "Database benchmarks completed"
    else
        log "WARN" "benchmark-database.sh not found"
    fi
else
    log "WARN" "Skipping database benchmarks (psql/pgbench not available)"
fi

# Test 2: API Benchmarks
if command -v ab &> /dev/null; then
    echo -e "\n${BLUE}================================================${NC}"
    echo -e "${BLUE}Test 2: API Performance Benchmarks${NC}"
    echo -e "${BLUE}================================================${NC}"
    log "INFO" "Starting API benchmarks"

    if [ -f "$SCRIPT_DIR/benchmark-api.sh" ]; then
        chmod +x "$SCRIPT_DIR/benchmark-api.sh"
        "$SCRIPT_DIR/benchmark-api.sh" 2>&1 | tee -a "$RUN_LOG"
        log "INFO" "API benchmarks completed"
    else
        log "WARN" "benchmark-api.sh not found"
    fi
else
    log "WARN" "Skipping API benchmarks (ab not available)"
fi

# Test 3: k6 Load Tests
if command -v k6 &> /dev/null; then
    echo -e "\n${BLUE}================================================${NC}"
    echo -e "${BLUE}Test 3: k6 Load Tests${NC}"
    echo -e "${BLUE}================================================${NC}"
    log "INFO" "Starting k6 load tests"

    K6_TESTS_DIR="$(dirname "$SCRIPT_DIR")/tests/performance/k6"

    if [ -d "$K6_TESTS_DIR/scenarios" ]; then
        cd "$K6_TESTS_DIR" || exit 1

        # Run baseline test
        if [ -f "scenarios/api-baseline.js" ]; then
            log "INFO" "Running k6 API baseline test"
            k6 run scenarios/api-baseline.js --out json="$RESULTS_DIR/k6_baseline_$TIMESTAMP.json" 2>&1 | tee -a "$RUN_LOG"
        fi

        # Run concurrent users test
        if [ -f "scenarios/concurrent-users.js" ]; then
            log "INFO" "Running k6 concurrent users test"
            k6 run scenarios/concurrent-users.js --out json="$RESULTS_DIR/k6_concurrent_$TIMESTAMP.json" 2>&1 | tee -a "$RUN_LOG"
        fi

        cd "$SCRIPT_DIR" || exit 1
        log "INFO" "k6 load tests completed"
    else
        log "WARN" "k6 test scenarios not found"
    fi
else
    log "WARN" "Skipping k6 tests (k6 not available)"
fi

# Test 4: Artillery Load Tests
if command -v artillery &> /dev/null; then
    echo -e "\n${BLUE}================================================${NC}"
    echo -e "${BLUE}Test 4: Artillery Load Tests${NC}"
    echo -e "${BLUE}================================================${NC}"
    log "INFO" "Starting Artillery load tests"

    ARTILLERY_TESTS_DIR="$(dirname "$SCRIPT_DIR")/tests/performance/artillery"

    if [ -d "$ARTILLERY_TESTS_DIR" ]; then
        cd "$ARTILLERY_TESTS_DIR" || exit 1

        # Run API endpoints test
        if [ -f "api-endpoints.yml" ]; then
            log "INFO" "Running Artillery API endpoints test"
            artillery run api-endpoints.yml --output "$RESULTS_DIR/artillery_api_$TIMESTAMP.json" 2>&1 | tee -a "$RUN_LOG"
        fi

        cd "$SCRIPT_DIR" || exit 1
        log "INFO" "Artillery load tests completed"
    else
        log "WARN" "Artillery test configs not found"
    fi
else
    log "WARN" "Skipping Artillery tests (artillery not available)"
fi

# Test 5: Compare Results
echo -e "\n${BLUE}================================================${NC}"
echo -e "${BLUE}Test 5: Comparing Results with Baseline${NC}"
echo -e "${BLUE}================================================${NC}"
log "INFO" "Comparing results with baseline"

if [ -f "$SCRIPT_DIR/compare-results.sh" ]; then
    chmod +x "$SCRIPT_DIR/compare-results.sh"
    "$SCRIPT_DIR/compare-results.sh" 2>&1 | tee -a "$RUN_LOG"
    log "INFO" "Results comparison completed"
else
    log "WARN" "compare-results.sh not found"
fi

# Generate summary report
echo -e "\n${BLUE}================================================${NC}"
echo -e "${BLUE}Generating Summary Report${NC}"
echo -e "${BLUE}================================================${NC}"

SUMMARY_FILE="$RESULTS_DIR/summary_$TIMESTAMP.md"

cat > "$SUMMARY_FILE" << EOF
# Performance Test Suite Summary

**Test Run:** $TIMESTAMP
**Date:** $(date)

## Test Execution

EOF

# Count test results
num_files=$(find "$RESULTS_DIR" -name "*$TIMESTAMP*" -type f | wc -l)

cat >> "$SUMMARY_FILE" << EOF
- Total result files generated: $num_files
- Database benchmarks: $(ls "$RESULTS_DIR"/query_benchmarks_$TIMESTAMP.csv 2>/dev/null | wc -l)
- API benchmarks: $(ls "$RESULTS_DIR"/ab_*_$TIMESTAMP.txt 2>/dev/null | wc -l)
- k6 tests: $(ls "$RESULTS_DIR"/k6_*_$TIMESTAMP.json 2>/dev/null | wc -l)
- Artillery tests: $(ls "$RESULTS_DIR"/artillery_*_$TIMESTAMP.json 2>/dev/null | wc -l)

## Results Location

All results are saved in: \`$RESULTS_DIR\`

## Key Findings

EOF

# Extract key metrics if available
if [ -f "$RESULTS_DIR/query_benchmarks_$TIMESTAMP.csv" ]; then
    avg_query_time=$(awk -F',' 'NR>1 {sum+=$2; count++} END {print sum/count}' "$RESULTS_DIR/query_benchmarks_$TIMESTAMP.csv")
    cat >> "$SUMMARY_FILE" << EOF
### Database Performance
- Average query time: ${avg_query_time}ms

EOF
fi

cat >> "$SUMMARY_FILE" << EOF
## Next Steps

1. Review individual test results in the results directory
2. Check comparison report for regressions
3. Investigate any performance degradations
4. Update baselines if results are acceptable

## Test Log

See full test log: \`$RUN_LOG\`
EOF

echo -e "${GREEN}✓${NC} Summary report generated: $SUMMARY_FILE"

# Final summary
echo -e "\n${GREEN}================================================${NC}"
echo -e "${GREEN}All Performance Tests Completed!${NC}"
echo -e "${GREEN}================================================${NC}"
echo "Completed: $(date)"
echo "Duration: $(grep -oP '(?<=Started: ).*' "$RUN_LOG" || echo "N/A")"
echo ""
echo "Results location: $RESULTS_DIR"
echo "Test log: $RUN_LOG"
echo "Summary report: $SUMMARY_FILE"
echo ""
echo -e "${YELLOW}Review the following files:${NC}"
ls -lht "$RESULTS_DIR"/*"$TIMESTAMP"* 2>/dev/null | head -10

log "INFO" "Performance test suite completed successfully"

exit 0
