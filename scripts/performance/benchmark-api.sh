#!/bin/bash
# API Performance Benchmarking Script
# Tests API endpoints with Apache Bench (ab) and curl-based timing

set -euo pipefail

# Configuration
API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
API_TOKEN="${API_TOKEN:-}"
RESULTS_DIR="./results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Test parameters
NUM_REQUESTS=1000
CONCURRENCY=100

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create results directory
mkdir -p "$RESULTS_DIR"

echo "================================================"
echo "API Performance Benchmark"
echo "================================================"
echo "Base URL: $API_BASE_URL"
echo "Timestamp: $TIMESTAMP"
echo "Requests: $NUM_REQUESTS"
echo "Concurrency: $CONCURRENCY"
echo "================================================"

# Check if ab (Apache Bench) is installed
if ! command -v ab &> /dev/null; then
    echo -e "${RED}Error: Apache Bench (ab) is not installed${NC}"
    echo "Install with: apt-get install apache2-utils (Debian/Ubuntu) or yum install httpd-tools (RHEL/CentOS)"
    exit 1
fi

# Function to run API benchmark with ab
benchmark_endpoint() {
    local method="$1"
    local endpoint="$2"
    local description="$3"
    local data="${4:-}"

    local url="${API_BASE_URL}${endpoint}"

    echo -e "\n${YELLOW}=== $description ===${NC}"
    echo "URL: $url"
    echo "Method: $method"

    local ab_args="-n $NUM_REQUESTS -c $CONCURRENCY"

    # Add authorization header if token is provided
    if [ -n "$API_TOKEN" ]; then
        ab_args="$ab_args -H 'Authorization: Bearer $API_TOKEN'"
    fi

    # Add content-type for POST/PATCH
    if [ "$method" = "POST" ] || [ "$method" = "PATCH" ]; then
        ab_args="$ab_args -H 'Content-Type: application/json'"

        if [ -n "$data" ]; then
            # Save data to temp file
            local temp_file=$(mktemp)
            echo "$data" > "$temp_file"
            ab_args="$ab_args -p $temp_file"
        fi
    fi

    # Run benchmark
    local output_file="$RESULTS_DIR/ab_${description// /_}_$TIMESTAMP.txt"

    if [ "$method" = "GET" ]; then
        ab $ab_args "$url" > "$output_file" 2>&1
    elif [ "$method" = "POST" ]; then
        ab $ab_args -p "$temp_file" "$url" > "$output_file" 2>&1
        rm -f "$temp_file"
    fi

    # Extract and display key metrics
    if [ -f "$output_file" ]; then
        echo -e "\n${GREEN}Results:${NC}"
        grep "Requests per second:" "$output_file" || true
        grep "Time per request:" "$output_file" || true
        grep "Transfer rate:" "$output_file" || true
        grep "Percentage of the requests" "$output_file" || true
    fi
}

# Function to test single endpoint latency with curl
test_endpoint_latency() {
    local method="$1"
    local endpoint="$2"
    local description="$3"
    local data="${4:-}"

    local url="${API_BASE_URL}${endpoint}"

    echo -e "\n${YELLOW}Testing: $description${NC}"

    local curl_args="-s -w '\nTime: %{time_total}s\nStatus: %{http_code}\n'"

    if [ -n "$API_TOKEN" ]; then
        curl_args="$curl_args -H 'Authorization: Bearer $API_TOKEN'"
    fi

    if [ "$method" = "POST" ] || [ "$method" = "PATCH" ]; then
        curl_args="$curl_args -H 'Content-Type: application/json'"
        if [ -n "$data" ]; then
            curl_args="$curl_args -d '$data'"
        fi
    fi

    # Run curl and capture output
    eval "curl $curl_args -X $method '$url' -o /dev/null"
}

# Health check endpoint
echo -e "\n${YELLOW}=== Health Check Endpoint ===${NC}"
benchmark_endpoint "GET" "/health" "Health Check"

# Test individual endpoint latency
echo -e "\n${YELLOW}=== Single Request Latency Tests ===${NC}"

test_endpoint_latency "GET" "/health" "Health endpoint"
test_endpoint_latency "GET" "/api/v1/tasks" "List tasks (no auth)"

# If we have an auth token, test protected endpoints
if [ -n "$API_TOKEN" ]; then
    echo -e "\n${YELLOW}=== Authenticated Endpoint Benchmarks ===${NC}"

    # List tasks
    benchmark_endpoint "GET" "/api/v1/tasks?limit=50" "List Tasks (50 items)"

    # Search tasks
    benchmark_endpoint "GET" "/api/v1/tasks/search?q=patient&limit=20" "Search Tasks"

    # Get task statistics
    benchmark_endpoint "GET" "/api/v1/tasks/stats" "Task Statistics"

    # Create task (light load)
    echo -e "\n${YELLOW}=== Task Creation Benchmark ===${NC}"
    local task_data='{
        "title": "Benchmark Task",
        "description": "Performance test task",
        "patientId": "PAT-12345",
        "priority": "medium",
        "status": "pending",
        "type": "medication"
    }'

    # For POST, we'll use a simpler approach with wrk if available
    if command -v wrk &> /dev/null; then
        echo "Using wrk for POST benchmark..."

        local lua_script=$(mktemp --suffix=.lua)
        cat > "$lua_script" << 'EOF'
wrk.method = "POST"
wrk.body   = '{"title":"Benchmark Task","patientId":"PAT-12345","priority":"medium","status":"pending","type":"medication"}'
wrk.headers["Content-Type"] = "application/json"
EOF

        if [ -n "$API_TOKEN" ]; then
            echo "wrk.headers[\"Authorization\"] = \"Bearer $API_TOKEN\"" >> "$lua_script"
        fi

        wrk -t4 -c100 -d30s --latency -s "$lua_script" "${API_BASE_URL}/api/v1/tasks" | tee "$RESULTS_DIR/wrk_create_task_$TIMESTAMP.txt"

        rm -f "$lua_script"
    else
        echo "wrk not found, skipping POST benchmark (install wrk for better POST testing)"
    fi
else
    echo -e "\n${YELLOW}Skipping authenticated endpoints (no API_TOKEN provided)${NC}"
    echo "Set API_TOKEN environment variable to test protected endpoints"
fi

# Stress test with multiple endpoints
echo -e "\n${YELLOW}=== Multi-Endpoint Stress Test ===${NC}"

if [ -n "$API_TOKEN" ]; then
    # Create a URL list file for concurrent testing
    local url_list=$(mktemp)
    cat > "$url_list" << EOF
${API_BASE_URL}/api/v1/tasks
${API_BASE_URL}/api/v1/tasks/stats
${API_BASE_URL}/health
EOF

    echo "Testing multiple endpoints concurrently..."

    # Test each URL with moderate load
    while IFS= read -r url; do
        echo -e "\n${YELLOW}Testing: $url${NC}"
        ab -n 500 -c 50 -H "Authorization: Bearer $API_TOKEN" "$url" > /dev/null 2>&1 &
    done < "$url_list"

    # Wait for all background jobs
    wait

    echo -e "${GREEN}✓${NC} Multi-endpoint stress test complete"

    rm -f "$url_list"
fi

# Test with different concurrency levels
echo -e "\n${YELLOW}=== Concurrency Scaling Test ===${NC}"

test_concurrency_level() {
    local concurrency="$1"
    local endpoint="/health"
    local url="${API_BASE_URL}${endpoint}"

    echo -e "\n${YELLOW}Testing with $concurrency concurrent connections${NC}"

    ab -n 1000 -c "$concurrency" -q "$url" 2>&1 | grep -E "Requests per second|Time per request|failed requests" | tee -a "$RESULTS_DIR/concurrency_scaling_$TIMESTAMP.txt"
}

test_concurrency_level 10
test_concurrency_level 50
test_concurrency_level 100
test_concurrency_level 200

# HTTP/2 test if supported
echo -e "\n${YELLOW}=== HTTP/2 Support Test ===${NC}"
if curl --http2 -I -s "${API_BASE_URL}/health" | grep -q "HTTP/2"; then
    echo -e "${GREEN}✓${NC} HTTP/2 is supported"
else
    echo -e "${YELLOW}⚠${NC}  HTTP/2 is not supported"
fi

# Response size analysis
echo -e "\n${YELLOW}=== Response Size Analysis ===${NC}"

analyze_response_size() {
    local endpoint="$1"
    local description="$2"
    local url="${API_BASE_URL}${endpoint}"

    local size=$(curl -s "$url" | wc -c)
    local compressed_size=$(curl -s -H "Accept-Encoding: gzip" "$url" | wc -c)

    echo "$description:"
    echo "  Uncompressed: $size bytes"
    echo "  Compressed: $compressed_size bytes"
    echo "  Compression ratio: $(echo "scale=2; $compressed_size / $size * 100" | bc)%"
}

analyze_response_size "/health" "Health endpoint"
if [ -n "$API_TOKEN" ]; then
    analyze_response_size "/api/v1/tasks?limit=50" "Task list (50 items)"
fi

echo -e "\n${GREEN}================================================${NC}"
echo -e "${GREEN}API Benchmark Complete!${NC}"
echo -e "${GREEN}================================================${NC}"
echo "Results saved to: $RESULTS_DIR/"
echo ""
echo "Files created:"
ls -lh "$RESULTS_DIR"/*"$TIMESTAMP"* 2>/dev/null || true

# Generate summary report
echo -e "\n${YELLOW}=== Summary Report ===${NC}"
echo "Benchmark completed at: $(date)"
echo "Total test files: $(ls "$RESULTS_DIR"/*"$TIMESTAMP"* 2>/dev/null | wc -l)"

exit 0
