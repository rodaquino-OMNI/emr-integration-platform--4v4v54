#!/bin/bash
# Performance Results Comparison Script
# Compares current benchmark results with baseline

set -euo pipefail

# Configuration
RESULTS_DIR="./results"
BASELINE_DIR="./results/baseline"
REPORT_FILE="./results/comparison_report.md"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "================================================"
echo "Performance Results Comparison"
echo "================================================"

# Check if results directory exists
if [ ! -d "$RESULTS_DIR" ]; then
    echo -e "${RED}Error: Results directory not found${NC}"
    exit 1
fi

# Create baseline directory if it doesn't exist
mkdir -p "$BASELINE_DIR"

# Function to compare two numeric values
compare_values() {
    local current="$1"
    local baseline="$2"
    local metric_name="$3"
    local threshold="${4:-10}" # Default 10% threshold

    # Calculate percentage difference
    local diff=$(echo "scale=2; (($current - $baseline) / $baseline) * 100" | bc)
    local abs_diff=$(echo "$diff" | tr -d '-')

    # Determine status
    if (( $(echo "$abs_diff < $threshold" | bc -l) )); then
        echo -e "${GREEN}✓${NC} $metric_name: ${current} (baseline: ${baseline}, diff: ${diff}%)"
        return 0
    elif (( $(echo "$diff > 0" | bc -l) )); then
        echo -e "${RED}✗${NC} $metric_name: ${current} (baseline: ${baseline}, REGRESSION: +${diff}%)"
        return 1
    else
        echo -e "${GREEN}✓${NC} $metric_name: ${current} (baseline: ${baseline}, improvement: ${diff}%)"
        return 0
    fi
}

# Initialize report
cat > "$REPORT_FILE" << 'EOF'
# Performance Benchmark Comparison Report

**Generated:** $(date)

## Overview

This report compares current performance metrics against established baselines.

---

## Summary

EOF

# Find latest benchmark files
LATEST_QUERY_FILE=$(ls -t "$RESULTS_DIR"/query_benchmarks_*.csv 2>/dev/null | head -1)
LATEST_CONNECTION_FILE=$(ls -t "$RESULTS_DIR"/connection_pool_*.csv 2>/dev/null | head -1)
LATEST_PGBENCH_FILE=$(ls -t "$RESULTS_DIR"/pgbench_10c_*.log 2>/dev/null | head -1)

# Baseline files
BASELINE_QUERY_FILE="$BASELINE_DIR/query_benchmarks_baseline.csv"
BASELINE_CONNECTION_FILE="$BASELINE_DIR/connection_pool_baseline.csv"
BASELINE_PGBENCH_FILE="$BASELINE_DIR/pgbench_baseline.log"

echo -e "\n${YELLOW}=== Database Query Performance ===${NC}"

if [ -f "$LATEST_QUERY_FILE" ]; then
    echo "Latest query results: $LATEST_QUERY_FILE"

    if [ -f "$BASELINE_QUERY_FILE" ]; then
        echo "Comparing with baseline: $BASELINE_QUERY_FILE"

        cat >> "$REPORT_FILE" << EOF

### Database Query Performance

| Query | Current (ms) | Baseline (ms) | Difference | Status |
|-------|--------------|---------------|------------|--------|
EOF

        # Compare each query
        while IFS=',' read -r query_name current_time; do
            # Skip header
            if [ "$query_name" = "Query" ]; then
                continue
            fi

            # Find matching baseline
            baseline_time=$(grep "^$query_name," "$BASELINE_QUERY_FILE" | cut -d',' -f2)

            if [ -n "$baseline_time" ]; then
                # Calculate difference
                diff=$(echo "scale=2; (($current_time - $baseline_time) / $baseline_time) * 100" | bc)
                abs_diff=$(echo "$diff" | tr -d '-')

                if (( $(echo "$abs_diff < 10" | bc -l) )); then
                    status="✓ OK"
                    color="${GREEN}"
                elif (( $(echo "$diff > 0" | bc -l) )); then
                    status="✗ REGRESSION"
                    color="${RED}"
                else
                    status="✓ IMPROVED"
                    color="${GREEN}"
                fi

                echo -e "${color}$query_name: ${current_time}ms (baseline: ${baseline_time}ms, diff: ${diff}%)${NC}"
                echo "| $query_name | $current_time | $baseline_time | ${diff}% | $status |" >> "$REPORT_FILE"
            else
                echo -e "${YELLOW}$query_name: ${current_time}ms (no baseline)${NC}"
                echo "| $query_name | $current_time | N/A | N/A | ⚠ NEW |" >> "$REPORT_FILE"
            fi
        done < "$LATEST_QUERY_FILE"
    else
        echo -e "${YELLOW}No baseline found. Current results will be saved as baseline.${NC}"
        cp "$LATEST_QUERY_FILE" "$BASELINE_QUERY_FILE"
    fi
else
    echo -e "${YELLOW}No query benchmark results found${NC}"
fi

echo -e "\n${YELLOW}=== Connection Pool Performance ===${NC}"

if [ -f "$LATEST_CONNECTION_FILE" ]; then
    echo "Latest connection pool results: $LATEST_CONNECTION_FILE"

    if [ -f "$BASELINE_CONNECTION_FILE" ]; then
        echo "Comparing with baseline: $BASELINE_CONNECTION_FILE"

        cat >> "$REPORT_FILE" << EOF

### Connection Pool Performance

| Connections | Current (ms) | Baseline (ms) | Difference | Status |
|-------------|--------------|---------------|------------|--------|
EOF

        # Compare connection pool results
        while IFS=',' read -r connections current_time; do
            # Extract numeric values
            conn_num=$(echo "$connections" | grep -oP '\d+')
            time_val=$(echo "$current_time" | grep -oP '\d+')

            if [ -z "$conn_num" ]; then
                continue
            fi

            # Find matching baseline
            baseline_line=$(grep "^Concurrent connections: $conn_num," "$BASELINE_CONNECTION_FILE")
            baseline_time=$(echo "$baseline_line" | grep -oP 'Duration_ms: \K\d+')

            if [ -n "$baseline_time" ]; then
                diff=$(echo "scale=2; (($time_val - $baseline_time) / $baseline_time) * 100" | bc)
                abs_diff=$(echo "$diff" | tr -d '-')

                if (( $(echo "$abs_diff < 10" | bc -l) )); then
                    status="✓ OK"
                    color="${GREEN}"
                elif (( $(echo "$diff > 0" | bc -l) )); then
                    status="✗ SLOWER"
                    color="${RED}"
                else
                    status="✓ FASTER"
                    color="${GREEN}"
                fi

                echo -e "${color}${conn_num} connections: ${time_val}ms (baseline: ${baseline_time}ms, diff: ${diff}%)${NC}"
                echo "| $conn_num | $time_val | $baseline_time | ${diff}% | $status |" >> "$REPORT_FILE"
            fi
        done < "$LATEST_CONNECTION_FILE"
    else
        echo -e "${YELLOW}No baseline found. Current results will be saved as baseline.${NC}"
        cp "$LATEST_CONNECTION_FILE" "$BASELINE_CONNECTION_FILE"
    fi
else
    echo -e "${YELLOW}No connection pool results found${NC}"
fi

echo -e "\n${YELLOW}=== pgbench Performance ===${NC}"

if [ -f "$LATEST_PGBENCH_FILE" ]; then
    echo "Latest pgbench results: $LATEST_PGBENCH_FILE"

    # Extract TPS from pgbench output
    current_tps=$(grep "tps =" "$LATEST_PGBENCH_FILE" | awk '{print $3}')
    current_latency=$(grep "latency average" "$LATEST_PGBENCH_FILE" | awk '{print $4}')

    if [ -f "$BASELINE_PGBENCH_FILE" ]; then
        baseline_tps=$(grep "tps =" "$BASELINE_PGBENCH_FILE" | awk '{print $3}')
        baseline_latency=$(grep "latency average" "$BASELINE_PGBENCH_FILE" | awk '{print $4}')

        cat >> "$REPORT_FILE" << EOF

### pgbench Performance

| Metric | Current | Baseline | Difference | Status |
|--------|---------|----------|------------|--------|
EOF

        # Compare TPS
        if [ -n "$current_tps" ] && [ -n "$baseline_tps" ]; then
            tps_diff=$(echo "scale=2; (($current_tps - $baseline_tps) / $baseline_tps) * 100" | bc)
            echo "TPS: $current_tps (baseline: $baseline_tps, diff: $tps_diff%)"
            echo "| TPS | $current_tps | $baseline_tps | ${tps_diff}% | ✓ |" >> "$REPORT_FILE"
        fi

        # Compare Latency
        if [ -n "$current_latency" ] && [ -n "$baseline_latency" ]; then
            lat_diff=$(echo "scale=2; (($current_latency - $baseline_latency) / $baseline_latency) * 100" | bc)
            echo "Latency: $current_latency ms (baseline: $baseline_latency ms, diff: $lat_diff%)"
            echo "| Latency | $current_latency | $baseline_latency | ${lat_diff}% | ✓ |" >> "$REPORT_FILE"
        fi
    else
        echo -e "${YELLOW}No baseline found. Current results will be saved as baseline.${NC}"
        cp "$LATEST_PGBENCH_FILE" "$BASELINE_PGBENCH_FILE"
    fi
else
    echo -e "${YELLOW}No pgbench results found${NC}"
fi

# Add recommendations section
cat >> "$REPORT_FILE" << 'EOF'

---

## Recommendations

EOF

# Analyze and provide recommendations
if [ -f "$LATEST_QUERY_FILE" ] && [ -f "$BASELINE_QUERY_FILE" ]; then
    # Calculate average query time
    current_avg=$(awk -F',' 'NR>1 {sum+=$2; count++} END {print sum/count}' "$LATEST_QUERY_FILE")
    baseline_avg=$(awk -F',' 'NR>1 {sum+=$2; count++} END {print sum/count}' "$BASELINE_QUERY_FILE")

    if (( $(echo "$current_avg > $baseline_avg * 1.1" | bc -l) )); then
        cat >> "$REPORT_FILE" << EOF
- ⚠ **Query performance has regressed by $(echo "scale=2; (($current_avg - $baseline_avg) / $baseline_avg) * 100" | bc)%**
  - Review slow query log
  - Check for missing indexes
  - Analyze query plans
  - Consider database maintenance (VACUUM, ANALYZE)

EOF
    fi
fi

cat >> "$REPORT_FILE" << 'EOF'
## Next Steps

1. Review any regressions identified above
2. Run `EXPLAIN ANALYZE` on slow queries
3. Check database configuration parameters
4. Monitor production metrics
5. Update baselines if current results are acceptable

---

**Note:** This report is automatically generated. Baseline files are stored in `results/baseline/`.
EOF

echo -e "\n${GREEN}================================================${NC}"
echo -e "${GREEN}Comparison Complete!${NC}"
echo -e "${GREEN}================================================${NC}"
echo "Report saved to: $REPORT_FILE"
echo ""
cat "$REPORT_FILE"

exit 0
