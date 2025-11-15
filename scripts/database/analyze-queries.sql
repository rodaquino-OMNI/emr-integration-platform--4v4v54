-- ============================================================================
-- Query Performance Analysis Script
-- ============================================================================
-- Purpose: Identify slow queries and performance bottlenecks
-- Usage: psql -d emr_platform -f analyze-queries.sql
-- ============================================================================

\echo '=========================================='
\echo 'EMR Platform - Query Performance Analysis'
\echo '=========================================='
\echo ''

-- ============================================================================
-- 1. SLOW QUERIES (queries taking > 100ms)
-- ============================================================================
\echo '1. SLOW QUERIES (execution time > 100ms)'
\echo '------------------------------------------'

SELECT
  query,
  calls,
  total_exec_time,
  mean_exec_time,
  max_exec_time,
  min_exec_time,
  stddev_exec_time,
  ROUND((100 * total_exec_time / SUM(total_exec_time) OVER ())::numeric, 2) AS percent_total_time
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY total_exec_time DESC
LIMIT 20;

\echo ''

-- ============================================================================
-- 2. MOST FREQUENTLY EXECUTED QUERIES
-- ============================================================================
\echo '2. MOST FREQUENTLY EXECUTED QUERIES'
\echo '------------------------------------'

SELECT
  LEFT(query, 80) AS query_preview,
  calls,
  ROUND(mean_exec_time::numeric, 2) AS avg_time_ms,
  ROUND(total_exec_time::numeric, 2) AS total_time_ms,
  ROUND((100 * calls / SUM(calls) OVER ())::numeric, 2) AS percent_calls
FROM pg_stat_statements
ORDER BY calls DESC
LIMIT 20;

\echo ''

-- ============================================================================
-- 3. QUERIES WITH HIGHEST TOTAL EXECUTION TIME
-- ============================================================================
\echo '3. QUERIES WITH HIGHEST TOTAL EXECUTION TIME'
\echo '---------------------------------------------'

SELECT
  LEFT(query, 80) AS query_preview,
  calls,
  ROUND(total_exec_time::numeric, 2) AS total_time_ms,
  ROUND(mean_exec_time::numeric, 2) AS avg_time_ms,
  ROUND(max_exec_time::numeric, 2) AS max_time_ms,
  ROUND((100 * total_exec_time / SUM(total_exec_time) OVER ())::numeric, 2) AS percent_time
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;

\echo ''

-- ============================================================================
-- 4. TABLE-SPECIFIC QUERY PATTERNS
-- ============================================================================
\echo '4. QUERY PATTERNS BY TABLE'
\echo '--------------------------'

SELECT
  schemaname,
  tablename,
  seq_scan AS sequential_scans,
  seq_tup_read AS seq_rows_read,
  idx_scan AS index_scans,
  idx_tup_fetch AS idx_rows_fetched,
  CASE
    WHEN seq_scan + idx_scan > 0
    THEN ROUND((100.0 * idx_scan / (seq_scan + idx_scan))::numeric, 2)
    ELSE 0
  END AS index_scan_percent,
  n_tup_ins AS inserts,
  n_tup_upd AS updates,
  n_tup_del AS deletes,
  n_live_tup AS live_rows,
  n_dead_tup AS dead_rows
FROM pg_stat_user_tables
ORDER BY seq_scan + idx_scan DESC
LIMIT 20;

\echo ''

-- ============================================================================
-- 5. TABLES WITH HIGH SEQUENTIAL SCAN RATIOS
-- ============================================================================
\echo '5. TABLES WITH HIGH SEQUENTIAL SCAN RATIOS (need indexes?)'
\echo '-----------------------------------------------------------'

SELECT
  schemaname,
  tablename,
  seq_scan,
  seq_tup_read,
  idx_scan,
  CASE
    WHEN seq_scan > 0
    THEN ROUND((seq_tup_read::numeric / seq_scan), 0)
    ELSE 0
  END AS avg_seq_rows,
  CASE
    WHEN seq_scan + idx_scan > 0
    THEN ROUND((100.0 * seq_scan / (seq_scan + idx_scan))::numeric, 2)
    ELSE 0
  END AS seq_scan_percent,
  n_live_tup AS live_rows
FROM pg_stat_user_tables
WHERE seq_scan > 0
  AND (idx_scan = 0 OR seq_scan > idx_scan)
  AND n_live_tup > 1000
ORDER BY seq_scan DESC
LIMIT 15;

\echo ''

-- ============================================================================
-- 6. CACHE HIT RATIOS
-- ============================================================================
\echo '6. CACHE HIT RATIOS (should be > 99%)'
\echo '--------------------------------------'

SELECT
  'Table Cache Hit Rate' AS metric,
  ROUND(
    (SUM(heap_blks_hit) / NULLIF(SUM(heap_blks_hit + heap_blks_read), 0) * 100)::numeric,
    2
  ) AS percentage
FROM pg_statio_user_tables
UNION ALL
SELECT
  'Index Cache Hit Rate' AS metric,
  ROUND(
    (SUM(idx_blks_hit) / NULLIF(SUM(idx_blks_hit + idx_blks_read), 0) * 100)::numeric,
    2
  ) AS percentage
FROM pg_statio_user_indexes
UNION ALL
SELECT
  'Overall Cache Hit Rate' AS metric,
  ROUND(
    (SUM(blks_hit) / NULLIF(SUM(blks_hit + blks_read), 0) * 100)::numeric,
    2
  ) AS percentage
FROM pg_stat_database
WHERE datname = current_database();

\echo ''

-- ============================================================================
-- 7. VACUUM AND AUTOVACUUM STATS
-- ============================================================================
\echo '7. VACUUM AND AUTOVACUUM STATISTICS'
\echo '------------------------------------'

SELECT
  schemaname,
  tablename,
  n_live_tup AS live_rows,
  n_dead_tup AS dead_rows,
  CASE
    WHEN n_live_tup > 0
    THEN ROUND((100.0 * n_dead_tup / n_live_tup)::numeric, 2)
    ELSE 0
  END AS dead_row_percent,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze,
  vacuum_count,
  autovacuum_count
FROM pg_stat_user_tables
WHERE n_dead_tup > 100
ORDER BY n_dead_tup DESC
LIMIT 15;

\echo ''

-- ============================================================================
-- 8. LONG-RUNNING QUERIES (currently executing)
-- ============================================================================
\echo '8. CURRENTLY RUNNING QUERIES (> 5 seconds)'
\echo '-------------------------------------------'

SELECT
  pid,
  usename AS username,
  application_name,
  client_addr,
  state,
  EXTRACT(EPOCH FROM (NOW() - query_start))::INTEGER AS duration_seconds,
  LEFT(query, 100) AS query_preview
FROM pg_stat_activity
WHERE state != 'idle'
  AND query NOT LIKE '%pg_stat_activity%'
  AND (NOW() - query_start) > INTERVAL '5 seconds'
ORDER BY duration_seconds DESC;

\echo ''

-- ============================================================================
-- 9. LOCK CONTENTION
-- ============================================================================
\echo '9. LOCK CONTENTION (blocked queries)'
\echo '-------------------------------------'

SELECT
  blocked_locks.pid AS blocked_pid,
  blocked_activity.usename AS blocked_user,
  blocking_locks.pid AS blocking_pid,
  blocking_activity.usename AS blocking_user,
  blocked_activity.query AS blocked_statement,
  blocking_activity.query AS blocking_statement,
  blocked_locks.mode AS blocked_mode,
  blocking_locks.mode AS blocking_mode
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks
  ON blocking_locks.locktype = blocked_locks.locktype
  AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
  AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
  AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
  AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
  AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
  AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
  AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
  AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
  AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
  AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted
LIMIT 10;

\echo ''

-- ============================================================================
-- 10. CONNECTION POOL STATISTICS
-- ============================================================================
\echo '10. CONNECTION POOL STATISTICS'
\echo '-------------------------------'

SELECT
  COUNT(*) AS total_connections,
  COUNT(*) FILTER (WHERE state = 'active') AS active,
  COUNT(*) FILTER (WHERE state = 'idle') AS idle,
  COUNT(*) FILTER (WHERE state = 'idle in transaction') AS idle_in_transaction,
  COUNT(*) FILTER (WHERE state = 'idle in transaction (aborted)') AS idle_in_transaction_aborted,
  MAX(EXTRACT(EPOCH FROM (NOW() - state_change)))::INTEGER AS max_idle_seconds
FROM pg_stat_activity
WHERE datname = current_database();

\echo ''

-- ============================================================================
-- 11. RECOMMENDATIONS
-- ============================================================================
\echo '11. OPTIMIZATION RECOMMENDATIONS'
\echo '---------------------------------'
\echo ''
\echo 'Based on the analysis above:'
\echo '• Queries with mean_exec_time > 100ms should be optimized'
\echo '• Tables with seq_scan_percent > 50% may need indexes'
\echo '• Cache hit rate should be > 99%'
\echo '• Dead row percent > 10% suggests need for VACUUM'
\echo '• Long-running queries may indicate missing indexes or inefficient queries'
\echo '• Lock contention indicates potential transaction optimization opportunities'
\echo ''

-- Enable pg_stat_statements if not already enabled
\echo 'Note: pg_stat_statements extension must be enabled for query statistics.'
\echo 'Enable with: CREATE EXTENSION IF NOT EXISTS pg_stat_statements;'
\echo ''
