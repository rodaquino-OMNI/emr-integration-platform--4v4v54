-- ============================================================================
-- Table and Index Bloat Analysis Script
-- ============================================================================
-- Purpose: Identify bloated tables and indexes that waste storage
-- Usage: psql -d emr_platform -f table-bloat-analysis.sql
-- ============================================================================

\echo '================================================'
\echo 'EMR Platform - Table & Index Bloat Analysis'
\echo '================================================'
\echo ''

-- ============================================================================
-- 1. TABLE BLOAT ESTIMATION
-- ============================================================================
\echo '1. TABLE BLOAT ESTIMATION'
\echo '-------------------------'
\echo 'Estimated bloat for tables > 10MB'
\echo ''

WITH table_bloat AS (
  SELECT
    schemaname,
    tablename,
    pg_total_relation_size(schemaname||'.'||tablename) AS total_bytes,
    pg_relation_size(schemaname||'.'||tablename) AS table_bytes,
    n_live_tup,
    n_dead_tup,
    CASE
      WHEN n_live_tup > 0
      THEN ROUND((100.0 * n_dead_tup / (n_live_tup + n_dead_tup))::numeric, 2)
      ELSE 0
    END AS dead_tuple_percent,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze
  FROM pg_stat_user_tables
  WHERE pg_relation_size(schemaname||'.'||tablename) > 10 * 1024 * 1024  -- > 10MB
)
SELECT
  schemaname,
  tablename,
  pg_size_pretty(total_bytes) AS total_size,
  pg_size_pretty(table_bytes) AS table_size,
  n_live_tup AS live_tuples,
  n_dead_tup AS dead_tuples,
  dead_tuple_percent,
  CASE
    WHEN dead_tuple_percent > 20 THEN 'CRITICAL - VACUUM NEEDED'
    WHEN dead_tuple_percent > 10 THEN 'WARNING - Consider VACUUM'
    WHEN dead_tuple_percent > 5 THEN 'NOTICE - Monitor'
    ELSE 'OK'
  END AS status,
  CASE
    WHEN last_vacuum IS NULL AND last_autovacuum IS NULL
    THEN 'NEVER'
    WHEN last_vacuum > last_autovacuum OR last_autovacuum IS NULL
    THEN 'Manual: ' || last_vacuum::text
    ELSE 'Auto: ' || last_autovacuum::text
  END AS last_vacuum_info
FROM table_bloat
ORDER BY dead_tuple_percent DESC, total_bytes DESC;

\echo ''

-- ============================================================================
-- 2. DETAILED BLOAT CALCULATION (More Accurate)
-- ============================================================================
\echo '2. DETAILED TABLE BLOAT CALCULATION'
\echo '------------------------------------'
\echo 'More accurate estimation using pg_class statistics'
\echo ''

SELECT
  schemaname,
  tablename,
  pg_size_pretty(total_bytes) AS total_size,
  ROUND((total_bytes::numeric / (1024^2)), 2) AS total_mb,
  ROUND(((total_bytes - (n_live_tup * avg_width))::numeric / total_bytes * 100), 2) AS estimated_bloat_percent,
  pg_size_pretty((total_bytes - (n_live_tup * avg_width))::bigint) AS estimated_bloat_size,
  n_live_tup AS live_rows,
  n_dead_tup AS dead_rows,
  ROUND(avg_width::numeric, 2) AS avg_row_size
FROM (
  SELECT
    schemaname,
    tablename,
    pg_total_relation_size(schemaname||'.'||tablename) AS total_bytes,
    n_live_tup,
    n_dead_tup,
    (
      SELECT SUM(avg_width)
      FROM pg_stats
      WHERE schemaname = st.schemaname
        AND tablename = st.tablename
    ) AS avg_width
  FROM pg_stat_user_tables st
  WHERE pg_total_relation_size(schemaname||'.'||tablename) > 10 * 1024 * 1024
) AS bloat_data
WHERE avg_width IS NOT NULL
  AND n_live_tup > 0
  AND total_bytes > (n_live_tup * avg_width)
ORDER BY (total_bytes - (n_live_tup * avg_width)) DESC
LIMIT 20;

\echo ''

-- ============================================================================
-- 3. INDEX BLOAT ESTIMATION
-- ============================================================================
\echo '3. INDEX BLOAT ESTIMATION'
\echo '-------------------------'
\echo 'Indexes that may be bloated and need REINDEX'
\echo ''

SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch,
  CASE
    WHEN idx_scan > 0 AND idx_tup_read > 0
    THEN ROUND((100.0 * idx_tup_fetch / idx_tup_read)::numeric, 2)
    ELSE NULL
  END AS fetch_efficiency_percent,
  CASE
    WHEN pg_relation_size(indexrelid) > 100 * 1024 * 1024
      AND idx_scan > 0
      AND idx_tup_read > 0
      AND (idx_tup_fetch::numeric / idx_tup_read) < 0.5
    THEN 'CONSIDER REINDEX'
    WHEN pg_relation_size(indexrelid) > 100 * 1024 * 1024
      AND idx_scan = 0
    THEN 'UNUSED - CONSIDER DROP'
    ELSE 'OK'
  END AS recommendation
FROM pg_stat_user_indexes
WHERE pg_relation_size(indexrelid) > 10 * 1024 * 1024  -- > 10MB
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 20;

\echo ''

-- ============================================================================
-- 4. TABLES NEEDING VACUUM
-- ============================================================================
\echo '4. TABLES REQUIRING IMMEDIATE VACUUM'
\echo '-------------------------------------'
\echo ''

SELECT
  schemaname,
  tablename,
  n_live_tup AS live_rows,
  n_dead_tup AS dead_rows,
  ROUND((100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0))::numeric, 2) AS dead_percent,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
  last_vacuum,
  last_autovacuum,
  CASE
    WHEN last_vacuum IS NULL AND last_autovacuum IS NULL
    THEN 'NEVER VACUUMED'
    WHEN last_autovacuum > last_vacuum OR last_vacuum IS NULL
    THEN 'Last: ' || AGE(NOW(), last_autovacuum)
    ELSE 'Last: ' || AGE(NOW(), last_vacuum)
  END AS time_since_vacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
  AND (
    (n_dead_tup::numeric / NULLIF(n_live_tup + n_dead_tup, 0)) > 0.1
    OR n_dead_tup > 10000
  )
ORDER BY n_dead_tup DESC;

\echo ''

-- ============================================================================
-- 5. VACUUM PROGRESS (if any running)
-- ============================================================================
\echo '5. CURRENT VACUUM OPERATIONS'
\echo '-----------------------------'
\echo ''

SELECT
  a.pid,
  a.usename,
  a.datname,
  v.relid::regclass AS table_name,
  v.phase,
  v.heap_blks_total,
  v.heap_blks_scanned,
  v.heap_blks_vacuumed,
  ROUND((100.0 * v.heap_blks_scanned / NULLIF(v.heap_blks_total, 0))::numeric, 2) AS percent_complete,
  AGE(NOW(), a.xact_start) AS duration
FROM pg_stat_progress_vacuum v
JOIN pg_stat_activity a ON v.pid = a.pid;

\echo ''
\echo 'Note: If no rows returned, no VACUUM operations are currently running.'
\echo ''

-- ============================================================================
-- 6. AUTOVACUUM SETTINGS REVIEW
-- ============================================================================
\echo '6. AUTOVACUUM SETTINGS REVIEW'
\echo '------------------------------'
\echo ''

SELECT
  name,
  setting,
  unit,
  source,
  short_desc
FROM pg_settings
WHERE name LIKE '%autovacuum%'
  OR name LIKE '%vacuum%'
ORDER BY name;

\echo ''

-- ============================================================================
-- 7. TABLES WITH AUTOVACUUM DISABLED
-- ============================================================================
\echo '7. TABLES WITH CUSTOM AUTOVACUUM SETTINGS'
\echo '------------------------------------------'
\echo ''

SELECT
  n.nspname AS schema,
  c.relname AS table_name,
  ARRAY_TO_STRING(c.reloptions, ', ') AS autovacuum_settings
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND c.reloptions IS NOT NULL
  AND ARRAY_TO_STRING(c.reloptions, ',') LIKE '%autovacuum%'
ORDER BY n.nspname, c.relname;

\echo ''

-- ============================================================================
-- 8. TRANSACTION ID WRAPAROUND RISK
-- ============================================================================
\echo '8. TRANSACTION ID WRAPAROUND RISK'
\echo '----------------------------------'
\echo 'Tables approaching transaction ID wraparound limit'
\echo ''

SELECT
  schemaname,
  tablename,
  age(relfrozenxid) AS xid_age,
  ROUND((100.0 * age(relfrozenxid) / 2000000000)::numeric, 2) AS percent_to_wraparound,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  last_vacuum,
  last_autovacuum,
  CASE
    WHEN age(relfrozenxid) > 1500000000
    THEN 'CRITICAL - VACUUM FREEZE IMMEDIATELY'
    WHEN age(relfrozenxid) > 1000000000
    THEN 'WARNING - Schedule VACUUM FREEZE'
    WHEN age(relfrozenxid) > 500000000
    THEN 'NOTICE - Monitor'
    ELSE 'OK'
  END AS risk_level
FROM pg_stat_user_tables
JOIN pg_class ON pg_class.relname = tablename
  AND pg_class.relnamespace = (
    SELECT oid FROM pg_namespace WHERE nspname = schemaname
  )
ORDER BY age(relfrozenxid) DESC
LIMIT 20;

\echo ''

-- ============================================================================
-- 9. RECOMMENDED MAINTENANCE COMMANDS
-- ============================================================================
\echo '9. RECOMMENDED MAINTENANCE COMMANDS'
\echo '------------------------------------'
\echo ''

-- Generate VACUUM commands for bloated tables
SELECT
  'VACUUM (VERBOSE, ANALYZE) ' || schemaname || '.' || tablename || ';' AS maintenance_command
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
  AND (n_dead_tup::numeric / NULLIF(n_live_tup + n_dead_tup, 0)) > 0.1
ORDER BY n_dead_tup DESC
LIMIT 10;

\echo ''
\echo '-- For heavily bloated tables (full rewrite):';

SELECT
  'VACUUM FULL VERBOSE ' || schemaname || '.' || tablename || ';' AS full_vacuum_command
FROM pg_stat_user_tables
WHERE n_dead_tup > 10000
  AND (n_dead_tup::numeric / NULLIF(n_live_tup + n_dead_tup, 0)) > 0.2
ORDER BY n_dead_tup DESC
LIMIT 5;

\echo ''
\echo '-- For bloated indexes (rebuild):';

SELECT
  'REINDEX INDEX CONCURRENTLY ' || schemaname || '.' || indexname || ';' AS reindex_command
FROM pg_stat_user_indexes
WHERE idx_scan > 0
  AND pg_relation_size(indexrelid) > 50 * 1024 * 1024  -- > 50MB
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 10;

\echo ''

-- ============================================================================
-- 10. STORAGE SUMMARY
-- ============================================================================
\echo '10. STORAGE SUMMARY'
\echo '-------------------'
\echo ''

WITH storage_stats AS (
  SELECT
    SUM(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
    SUM(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
    SUM(pg_total_relation_size(schemaname||'.'||tablename) -
        pg_relation_size(schemaname||'.'||tablename)) AS index_size,
    SUM(n_dead_tup * 100) AS estimated_dead_bytes  -- Rough estimate
  FROM pg_stat_user_tables
)
SELECT
  pg_size_pretty(total_size) AS total_database_size,
  pg_size_pretty(table_size) AS total_table_size,
  pg_size_pretty(index_size) AS total_index_size,
  pg_size_pretty(estimated_dead_bytes) AS estimated_bloat_size,
  ROUND((100.0 * estimated_dead_bytes / NULLIF(total_size, 0))::numeric, 2) AS estimated_bloat_percent
FROM storage_stats;

\echo ''
\echo '================================================'
\echo 'Analysis Complete'
\echo '================================================'
\echo ''
\echo 'Key Actions:'
\echo '1. VACUUM tables with >10% dead tuples'
\echo '2. VACUUM FULL for tables with >20% bloat (requires table lock)'
\echo '3. REINDEX bloated indexes during maintenance window'
\echo '4. Monitor transaction ID age to prevent wraparound'
\echo '5. Review autovacuum settings if bloat persists'
\echo ''
