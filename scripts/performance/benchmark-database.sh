#!/bin/bash
# Database Performance Benchmarking Script
# Tests PostgreSQL query performance and connection pool behavior

set -euo pipefail

# Configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-emrtask}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-}"
RESULTS_DIR="./results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create results directory
mkdir -p "$RESULTS_DIR"

# Database connection URL
if [ -n "$DB_PASSWORD" ]; then
    DB_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=require"
else
    DB_URL="postgresql://${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
fi

echo "================================================"
echo "Database Performance Benchmark"
echo "================================================"
echo "Database: $DB_NAME"
echo "Host: $DB_HOST:$DB_PORT"
echo "Timestamp: $TIMESTAMP"
echo "================================================"

# Function to run a query and measure time
run_timed_query() {
    local query="$1"
    local description="$2"

    echo -e "\n${YELLOW}Running: $description${NC}"

    local start_time=$(date +%s%N)
    psql "$DB_URL" -c "$query" > /dev/null 2>&1
    local end_time=$(date +%s%N)

    local duration=$(( (end_time - start_time) / 1000000 ))
    echo -e "${GREEN}✓${NC} Duration: ${duration}ms"

    echo "$description,$duration" >> "$RESULTS_DIR/query_benchmarks_$TIMESTAMP.csv"
}

# Initialize results CSV
echo "Query,Duration_ms" > "$RESULTS_DIR/query_benchmarks_$TIMESTAMP.csv"

echo -e "\n${YELLOW}=== Basic Query Benchmarks ===${NC}"

# Simple SELECT
run_timed_query \
    "SELECT COUNT(*) FROM tasks;" \
    "Simple COUNT query"

# JOIN query
run_timed_query \
    "SELECT t.id, t.title, u.name FROM tasks t JOIN users u ON t.assigned_to = u.id LIMIT 1000;" \
    "JOIN query (1000 rows)"

# Aggregation query
run_timed_query \
    "SELECT status, COUNT(*) as count, AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_duration FROM tasks WHERE completed_at IS NOT NULL GROUP BY status;" \
    "Aggregation with GROUP BY"

# Index scan vs Sequential scan
run_timed_query \
    "SELECT * FROM tasks WHERE id = '$(uuidgen)';" \
    "Index scan (by ID)"

run_timed_query \
    "SELECT * FROM tasks WHERE title LIKE '%test%' LIMIT 100;" \
    "Pattern matching query"

echo -e "\n${YELLOW}=== Complex Query Benchmarks ===${NC}"

# Subquery
run_timed_query \
    "SELECT * FROM tasks WHERE patient_id IN (SELECT id FROM patients WHERE status = 'active') LIMIT 1000;" \
    "Subquery with IN clause"

# Window function
run_timed_query \
    "SELECT id, title, priority, ROW_NUMBER() OVER (PARTITION BY priority ORDER BY created_at DESC) as row_num FROM tasks LIMIT 1000;" \
    "Window function (ROW_NUMBER)"

# CTE (Common Table Expression)
run_timed_query \
    "WITH recent_tasks AS (SELECT * FROM tasks WHERE created_at > NOW() - INTERVAL '7 days') SELECT status, COUNT(*) FROM recent_tasks GROUP BY status;" \
    "CTE with aggregation"

echo -e "\n${YELLOW}=== pgbench Standard Benchmark ===${NC}"

# Initialize pgbench
echo "Initializing pgbench..."
pgbench -i -s 10 "$DB_URL" > "$RESULTS_DIR/pgbench_init_$TIMESTAMP.log" 2>&1

# Run pgbench with different configurations
echo -e "\n${YELLOW}Test 1: 10 clients, 2 threads, 1000 transactions${NC}"
pgbench -c 10 -j 2 -t 1000 "$DB_URL" | tee "$RESULTS_DIR/pgbench_10c_$TIMESTAMP.log"

echo -e "\n${YELLOW}Test 2: 50 clients, 4 threads, 500 transactions${NC}"
pgbench -c 50 -j 4 -t 500 "$DB_URL" | tee "$RESULTS_DIR/pgbench_50c_$TIMESTAMP.log"

echo -e "\n${YELLOW}Test 3: 100 clients, 8 threads, 250 transactions${NC}"
pgbench -c 100 -j 8 -t 250 "$DB_URL" | tee "$RESULTS_DIR/pgbench_100c_$TIMESTAMP.log"

# Cleanup pgbench tables
echo -e "\n${YELLOW}Cleaning up pgbench tables...${NC}"
psql "$DB_URL" -c "DROP TABLE IF EXISTS pgbench_accounts, pgbench_branches, pgbench_history, pgbench_tellers;" > /dev/null 2>&1

echo -e "\n${YELLOW}=== Connection Pool Stress Test ===${NC}"

# Function to test concurrent connections
test_concurrent_connections() {
    local num_connections="$1"
    echo -e "\n${YELLOW}Testing $num_connections concurrent connections${NC}"

    local start_time=$(date +%s%N)

    # Spawn multiple psql connections
    for i in $(seq 1 "$num_connections"); do
        psql "$DB_URL" -c "SELECT pg_sleep(0.1);" > /dev/null 2>&1 &
    done

    # Wait for all background jobs
    wait

    local end_time=$(date +%s%N)
    local duration=$(( (end_time - start_time) / 1000000 ))

    echo -e "${GREEN}✓${NC} $num_connections connections completed in ${duration}ms"
    echo "Concurrent connections: $num_connections,Duration_ms: $duration" >> "$RESULTS_DIR/connection_pool_$TIMESTAMP.csv"
}

echo "Connections,Duration_ms" > "$RESULTS_DIR/connection_pool_$TIMESTAMP.csv"

test_concurrent_connections 10
test_concurrent_connections 25
test_concurrent_connections 50
test_concurrent_connections 100

echo -e "\n${YELLOW}=== Database Statistics ===${NC}"

# Get database size
DB_SIZE=$(psql "$DB_URL" -t -c "SELECT pg_size_pretty(pg_database_size('$DB_NAME'));")
echo "Database size: $DB_SIZE"

# Get table sizes
echo -e "\nTop 10 largest tables:"
psql "$DB_URL" -c "
    SELECT
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
    FROM pg_tables
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
    LIMIT 10;
"

# Get index usage
echo -e "\nIndex usage statistics:"
psql "$DB_URL" -c "
    SELECT
        schemaname,
        tablename,
        indexname,
        idx_scan,
        idx_tup_read,
        idx_tup_fetch
    FROM pg_stat_user_indexes
    ORDER BY idx_scan DESC
    LIMIT 10;
"

# Get cache hit ratio
echo -e "\nCache hit ratio:"
psql "$DB_URL" -c "
    SELECT
        sum(heap_blks_read) as heap_read,
        sum(heap_blks_hit) as heap_hit,
        sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) * 100 AS cache_hit_ratio
    FROM pg_statio_user_tables;
"

# Run custom slow queries if available
if [ -f "./queries/slow-queries.sql" ]; then
    echo -e "\n${YELLOW}=== Running Custom Slow Queries ===${NC}"
    psql "$DB_URL" -f "./queries/slow-queries.sql" | tee "$RESULTS_DIR/slow_queries_$TIMESTAMP.log"
fi

echo -e "\n${GREEN}================================================${NC}"
echo -e "${GREEN}Benchmark Complete!${NC}"
echo -e "${GREEN}================================================${NC}"
echo "Results saved to: $RESULTS_DIR/"
echo "  - query_benchmarks_$TIMESTAMP.csv"
echo "  - connection_pool_$TIMESTAMP.csv"
echo "  - pgbench_*_$TIMESTAMP.log"

# Generate summary
echo -e "\n${YELLOW}=== Benchmark Summary ===${NC}"
echo "Total queries tested: $(wc -l < "$RESULTS_DIR/query_benchmarks_$TIMESTAMP.csv") - 1"
echo "Average query time: $(awk -F',' 'NR>1 {sum+=$2; count++} END {print sum/count "ms"}' "$RESULTS_DIR/query_benchmarks_$TIMESTAMP.csv")"
echo "Slowest query: $(sort -t',' -k2 -n "$RESULTS_DIR/query_benchmarks_$TIMESTAMP.csv" | tail -1)"
echo "Fastest query: $(sort -t',' -k2 -n "$RESULTS_DIR/query_benchmarks_$TIMESTAMP.csv" | head -2 | tail -1)"

exit 0
