#!/bin/bash

################################################################################
# Database Optimization Script
################################################################################
# Purpose: Perform routine database maintenance and optimization
# Usage: ./optimize.sh [options]
# Options:
#   --vacuum-only       Run only VACUUM operations
#   --analyze-only      Run only ANALYZE operations
#   --reindex-only      Run only REINDEX operations
#   --refresh-views     Refresh materialized views only
#   --full              Run VACUUM FULL (requires downtime)
#   --dry-run           Show commands without executing
#   --verbose           Enable verbose output
#
# Requirements:
#   - PostgreSQL client (psql)
#   - Database connection credentials
#   - Sufficient permissions for VACUUM, ANALYZE, REINDEX
################################################################################

set -euo pipefail

# Configuration
DB_NAME="${DB_NAME:-emr_platform}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"

# Options
VACUUM_ONLY=false
ANALYZE_ONLY=false
REINDEX_ONLY=false
REFRESH_VIEWS_ONLY=false
FULL_VACUUM=false
DRY_RUN=false
VERBOSE=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

################################################################################
# Helper Functions
################################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

execute_sql() {
    local sql="$1"
    local description="${2:-Executing SQL}"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] $description"
        echo "  SQL: $sql"
        return 0
    fi

    log_info "$description..."

    if [[ "$VERBOSE" == "true" ]]; then
        echo "  SQL: $sql"
    fi

    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "$sql" > /dev/null 2>&1; then
        log_success "$description completed"
        return 0
    else
        log_error "$description failed"
        return 1
    fi
}

check_connection() {
    log_info "Checking database connection..."
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
        log_success "Database connection successful"
        return 0
    else
        log_error "Cannot connect to database"
        exit 1
    fi
}

################################################################################
# Parse Command Line Arguments
################################################################################

while [[ $# -gt 0 ]]; do
    case $1 in
        --vacuum-only)
            VACUUM_ONLY=true
            shift
            ;;
        --analyze-only)
            ANALYZE_ONLY=true
            shift
            ;;
        --reindex-only)
            REINDEX_ONLY=true
            shift
            ;;
        --refresh-views)
            REFRESH_VIEWS_ONLY=true
            shift
            ;;
        --full)
            FULL_VACUUM=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --help)
            cat << EOF
Database Optimization Script

Usage: $0 [options]

Options:
  --vacuum-only       Run only VACUUM operations
  --analyze-only      Run only ANALYZE operations
  --reindex-only      Run only REINDEX operations
  --refresh-views     Refresh materialized views only
  --full              Run VACUUM FULL (requires downtime/locks)
  --dry-run           Show commands without executing
  --verbose           Enable verbose output
  --help              Show this help message

Environment Variables:
  DB_NAME             Database name (default: emr_platform)
  DB_HOST             Database host (default: localhost)
  DB_PORT             Database port (default: 5432)
  DB_USER             Database user (default: postgres)

Examples:
  $0                              # Run all optimizations
  $0 --vacuum-only --verbose      # Vacuum with verbose output
  $0 --refresh-views --dry-run    # Preview view refresh commands
  $0 --full                       # Full vacuum (requires downtime)

EOF
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

################################################################################
# Main Execution
################################################################################

echo "========================================"
echo "EMR Platform - Database Optimization"
echo "========================================"
echo ""
echo "Database: $DB_NAME"
echo "Host: $DB_HOST:$DB_PORT"
echo "User: $DB_USER"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
    log_warning "DRY RUN MODE - No changes will be made"
fi

if [[ "$FULL_VACUUM" == "true" ]]; then
    log_warning "FULL VACUUM mode enabled - this will lock tables!"
fi

echo ""

# Check database connection
check_connection

echo ""
echo "========================================"
echo "Starting Optimization Process"
echo "========================================"
echo ""

################################################################################
# 1. VACUUM Operations
################################################################################

if [[ "$VACUUM_ONLY" == "true" || "$ANALYZE_ONLY" == "false" && "$REINDEX_ONLY" == "false" && "$REFRESH_VIEWS_ONLY" == "false" ]]; then
    echo "========================================"
    echo "1. VACUUM Operations"
    echo "========================================"
    echo ""

    # Get list of bloated tables
    BLOATED_TABLES=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
        SELECT schemaname || '.' || tablename
        FROM pg_stat_user_tables
        WHERE n_dead_tup > 1000
          AND (n_dead_tup::numeric / NULLIF(n_live_tup + n_dead_tup, 0)) > 0.05
        ORDER BY n_dead_tup DESC;
    " 2>/dev/null || echo "")

    if [[ -z "$BLOATED_TABLES" ]]; then
        log_info "No bloated tables found - skipping VACUUM"
    else
        while IFS= read -r table; do
            if [[ -n "$table" ]]; then
                table=$(echo "$table" | xargs)  # Trim whitespace
                if [[ "$FULL_VACUUM" == "true" ]]; then
                    execute_sql "VACUUM FULL VERBOSE $table;" "VACUUM FULL on $table"
                else
                    execute_sql "VACUUM (VERBOSE, ANALYZE) $table;" "VACUUM on $table"
                fi
            fi
        done <<< "$BLOATED_TABLES"

        log_success "VACUUM operations completed"
    fi

    echo ""
fi

################################################################################
# 2. ANALYZE Operations
################################################################################

if [[ "$ANALYZE_ONLY" == "true" || "$VACUUM_ONLY" == "false" && "$REINDEX_ONLY" == "false" && "$REFRESH_VIEWS_ONLY" == "false" ]]; then
    echo "========================================"
    echo "2. ANALYZE Operations"
    echo "========================================"
    echo ""

    # Analyze all user tables
    execute_sql "ANALYZE VERBOSE;" "Analyzing all tables"

    echo ""
fi

################################################################################
# 3. REINDEX Operations
################################################################################

if [[ "$REINDEX_ONLY" == "true" || "$VACUUM_ONLY" == "false" && "$ANALYZE_ONLY" == "false" && "$REFRESH_VIEWS_ONLY" == "false" ]]; then
    echo "========================================"
    echo "3. REINDEX Operations"
    echo "========================================"
    echo ""

    # Get list of large indexes
    LARGE_INDEXES=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
        SELECT schemaname || '.' || indexname
        FROM pg_stat_user_indexes
        WHERE pg_relation_size(indexrelid) > 50 * 1024 * 1024  -- > 50MB
          AND idx_scan > 0
        ORDER BY pg_relation_size(indexrelid) DESC
        LIMIT 10;
    " 2>/dev/null || echo "")

    if [[ -z "$LARGE_INDEXES" ]]; then
        log_info "No large indexes found - skipping REINDEX"
    else
        while IFS= read -r index; do
            if [[ -n "$index" ]]; then
                index=$(echo "$index" | xargs)  # Trim whitespace
                execute_sql "REINDEX INDEX CONCURRENTLY $index;" "REINDEX on $index"
            fi
        done <<< "$LARGE_INDEXES"

        log_success "REINDEX operations completed"
    fi

    echo ""
fi

################################################################################
# 4. Refresh Materialized Views
################################################################################

if [[ "$REFRESH_VIEWS_ONLY" == "true" || "$VACUUM_ONLY" == "false" && "$ANALYZE_ONLY" == "false" && "$REINDEX_ONLY" == "false" ]]; then
    echo "========================================"
    echo "4. Refresh Materialized Views"
    echo "========================================"
    echo ""

    # Check if refresh function exists
    FUNCTION_EXISTS=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
        SELECT EXISTS (
            SELECT 1
            FROM pg_proc
            WHERE proname = 'refresh_all_materialized_views'
        );
    " 2>/dev/null || echo "f")

    if [[ "$FUNCTION_EXISTS" == *"t"* ]]; then
        log_info "Refreshing all materialized views..."

        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY RUN] Would refresh materialized views"
        else
            psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
                SELECT * FROM refresh_all_materialized_views();
            "
            log_success "Materialized views refreshed"
        fi
    else
        log_warning "refresh_all_materialized_views() function not found"
        log_info "Skipping materialized view refresh"
    fi

    echo ""
fi

################################################################################
# 5. Statistics Collection
################################################################################

echo "========================================"
echo "5. Post-Optimization Statistics"
echo "========================================"
echo ""

if [[ "$DRY_RUN" == "false" ]]; then
    log_info "Collecting database statistics..."

    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << 'EOF'
\echo 'Database Size:'
SELECT pg_size_pretty(pg_database_size(current_database())) AS database_size;

\echo ''
\echo 'Table Statistics:'
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
    n_live_tup AS live_rows,
    n_dead_tup AS dead_rows,
    ROUND((100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0))::numeric, 2) AS dead_percent
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;

\echo ''
\echo 'Index Statistics:'
SELECT
    schemaname,
    tablename,
    COUNT(*) AS index_count,
    pg_size_pretty(SUM(pg_relation_size(indexrelid))) AS total_index_size
FROM pg_stat_user_indexes
GROUP BY schemaname, tablename
ORDER BY SUM(pg_relation_size(indexrelid)) DESC
LIMIT 10;
EOF

    echo ""
fi

################################################################################
# Completion
################################################################################

echo "========================================"
echo "Optimization Complete"
echo "========================================"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
    log_info "DRY RUN completed - no changes were made"
else
    log_success "Database optimization completed successfully"
fi

echo ""
echo "Recommended Next Steps:"
echo "1. Monitor query performance using scripts/database/analyze-queries.sql"
echo "2. Check for unused indexes using scripts/database/find-unused-indexes.sql"
echo "3. Review table bloat using scripts/database/table-bloat-analysis.sql"
echo "4. Schedule regular optimization via cron job"
echo ""

exit 0
