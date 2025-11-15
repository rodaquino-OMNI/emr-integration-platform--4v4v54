-- ============================================================================
-- Find Unused Indexes Script
-- ============================================================================
-- Purpose: Identify unused or rarely-used indexes that waste storage
-- Usage: psql -d emr_platform -f find-unused-indexes.sql
-- ============================================================================

\echo '================================================'
\echo 'EMR Platform - Unused Index Detection'
\echo '================================================'
\echo ''

-- ============================================================================
-- 1. COMPLETELY UNUSED INDEXES
-- ============================================================================
\echo '1. COMPLETELY UNUSED INDEXES (0 scans)'
\echo '---------------------------------------'
\echo 'Indexes that have never been used since statistics reset'
\echo ''

SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan AS scans,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size,
  indexdef AS definition
FROM pg_stat_user_indexes
JOIN pg_indexes USING (schemaname, tablename, indexname)
WHERE idx_scan = 0
  AND indexrelname NOT LIKE 'pg_toast%'
  AND schemaname = 'public'
  -- Exclude primary keys and unique constraints
  AND indexrelname NOT IN (
    SELECT conname
    FROM pg_constraint
    WHERE contype IN ('p', 'u')
  )
ORDER BY pg_relation_size(indexrelid) DESC;

\echo ''

-- ============================================================================
-- 2. RARELY USED INDEXES (< 50 scans)
-- ============================================================================
\echo '2. RARELY USED INDEXES (< 50 scans)'
\echo '------------------------------------'
\echo 'Indexes used fewer than 50 times - may be candidates for removal'
\echo ''

SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan AS scans,
  idx_tup_read AS tuples_read,
  idx_tup_fetch AS tuples_fetched,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size,
  CASE
    WHEN idx_scan > 0
    THEN ROUND((pg_relation_size(indexrelid)::numeric / idx_scan), 2)
    ELSE 0
  END AS bytes_per_scan
FROM pg_stat_user_indexes
WHERE idx_scan > 0
  AND idx_scan < 50
  AND schemaname = 'public'
  AND indexrelname NOT IN (
    SELECT conname
    FROM pg_constraint
    WHERE contype IN ('p', 'u')
  )
ORDER BY pg_relation_size(indexrelid) DESC;

\echo ''

-- ============================================================================
-- 3. DUPLICATE INDEXES (same columns, different names)
-- ============================================================================
\echo '3. POTENTIAL DUPLICATE INDEXES'
\echo '-------------------------------'
\echo 'Indexes on the same columns - one may be redundant'
\echo ''

SELECT
  pg_size_pretty(SUM(pg_relation_size(idx))::BIGINT) AS total_size,
  (array_agg(idx))[1] AS idx1,
  (array_agg(idx))[2] AS idx2,
  (array_agg(idx))[3] AS idx3,
  (array_agg(idx))[4] AS idx4
FROM (
  SELECT
    indexrelid::regclass AS idx,
    (indrelid::text ||E'\n'|| indclass::text ||E'\n'|| indkey::text ||E'\n'||
     COALESCE(indexprs::text,'')||E'\n' || COALESCE(indpred::text,'')) AS key
  FROM pg_index
) sub
GROUP BY key
HAVING COUNT(*) > 1
ORDER BY SUM(pg_relation_size(idx)) DESC;

\echo ''

-- ============================================================================
-- 4. INDEXES LARGER THAN THEIR TABLES
-- ============================================================================
\echo '4. INDEXES LARGER THAN THEIR TABLES'
\echo '------------------------------------'
\echo 'May indicate over-indexing or bloat'
\echo ''

SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
  pg_size_pretty(pg_relation_size(tablename::regclass)) AS table_size,
  ROUND(
    (100.0 * pg_relation_size(indexrelid) /
     NULLIF(pg_relation_size(tablename::regclass), 0))::numeric,
    2
  ) AS index_to_table_ratio
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND pg_relation_size(indexrelid) > pg_relation_size(tablename::regclass)
ORDER BY pg_relation_size(indexrelid) DESC;

\echo ''

-- ============================================================================
-- 5. INDEXES WITH LOW SCAN-TO-SIZE EFFICIENCY
-- ============================================================================
\echo '5. INDEXES WITH LOW SCAN-TO-SIZE EFFICIENCY'
\echo '--------------------------------------------'
\echo 'Large indexes that are scanned infrequently'
\echo ''

SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
  pg_relation_size(indexrelid) AS size_bytes,
  CASE
    WHEN idx_scan > 0
    THEN pg_size_pretty((pg_relation_size(indexrelid) / idx_scan)::BIGINT)
    ELSE 'N/A'
  END AS bytes_per_scan,
  CASE
    WHEN idx_scan > 0
    THEN ROUND((pg_relation_size(indexrelid)::numeric / idx_scan), 0)
    ELSE 0
  END AS efficiency_score
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND pg_relation_size(indexrelid) > 10 * 1024 * 1024  -- > 10MB
  AND idx_scan > 0
  AND indexrelname NOT IN (
    SELECT conname
    FROM pg_constraint
    WHERE contype IN ('p', 'u')
  )
ORDER BY
  CASE
    WHEN idx_scan > 0
    THEN pg_relation_size(indexrelid) / idx_scan
    ELSE 0
  END DESC
LIMIT 20;

\echo ''

-- ============================================================================
-- 6. BLOATED INDEXES
-- ============================================================================
\echo '6. BLOATED INDEXES (estimated)'
\echo '-------------------------------'
\echo 'Indexes with significant bloat - consider REINDEX'
\echo ''

SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
  CASE
    WHEN idx_scan > 0
    THEN ROUND((pg_relation_size(indexrelid)::numeric / idx_scan / 1024), 2)
    ELSE NULL
  END AS kb_per_scan,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND pg_relation_size(indexrelid) > 50 * 1024 * 1024  -- > 50MB
ORDER BY pg_relation_size(indexrelid) DESC;

\echo ''
\echo 'Note: Run REINDEX CONCURRENTLY on bloated indexes:'
\echo 'Example: REINDEX INDEX CONCURRENTLY index_name;'
\echo ''

-- ============================================================================
-- 7. INDEX USAGE SUMMARY BY TABLE
-- ============================================================================
\echo '7. INDEX USAGE SUMMARY BY TABLE'
\echo '--------------------------------'
\echo ''

SELECT
  tablename,
  COUNT(*) AS index_count,
  COUNT(*) FILTER (WHERE idx_scan = 0) AS unused_count,
  COUNT(*) FILTER (WHERE idx_scan > 0 AND idx_scan < 50) AS rarely_used_count,
  COUNT(*) FILTER (WHERE idx_scan >= 50) AS frequently_used_count,
  pg_size_pretty(SUM(pg_relation_size(indexrelid))) AS total_index_size,
  pg_size_pretty(
    SUM(pg_relation_size(indexrelid)) FILTER (WHERE idx_scan = 0)
  ) AS unused_index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY
  SUM(pg_relation_size(indexrelid)) FILTER (WHERE idx_scan = 0) DESC NULLS LAST;

\echo ''

-- ============================================================================
-- 8. RECOMMENDATIONS
-- ============================================================================
\echo '8. OPTIMIZATION RECOMMENDATIONS'
\echo '--------------------------------'
\echo ''

WITH index_stats AS (
  SELECT
    COUNT(*) AS total_indexes,
    COUNT(*) FILTER (WHERE idx_scan = 0) AS unused_indexes,
    pg_size_pretty(SUM(pg_relation_size(indexrelid))) AS total_size,
    pg_size_pretty(
      SUM(pg_relation_size(indexrelid)) FILTER (WHERE idx_scan = 0)
    ) AS wasted_size
  FROM pg_stat_user_indexes
  WHERE schemaname = 'public'
    AND indexrelname NOT IN (
      SELECT conname
      FROM pg_constraint
      WHERE contype IN ('p', 'u')
    )
)
SELECT
  'Total Indexes: ' || total_indexes AS summary,
  'Unused Indexes: ' || unused_indexes AS unused,
  'Total Size: ' || total_size AS size,
  'Wasted Space: ' || wasted_size AS wasted
FROM index_stats;

\echo ''
\echo 'Actions to consider:'
\echo '1. DROP unused indexes (0 scans) unless they support future queries'
\echo '2. REINDEX bloated indexes during maintenance window'
\echo '3. Review duplicate indexes and remove redundant ones'
\echo '4. Monitor rarely-used indexes - drop if consistently underutilized'
\echo '5. For large tables, consider partial indexes instead of full indexes'
\echo ''
\echo 'Before dropping an index, verify with application team that:'
\echo '  - Index is not used by batch/reporting jobs'
\echo '  - Index is not required for future planned features'
\echo '  - Dropping the index won''t impact query performance'
\echo ''

-- ============================================================================
-- 9. SAFE DROP COMMANDS
-- ============================================================================
\echo '9. SAFE DROP COMMANDS (for unused indexes > 1MB)'
\echo '-------------------------------------------------'
\echo 'Review before executing!'
\echo ''

SELECT
  'DROP INDEX CONCURRENTLY IF EXISTS ' || schemaname || '.' || indexname || ';' AS drop_command
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND schemaname = 'public'
  AND pg_relation_size(indexrelid) > 1024 * 1024  -- > 1MB
  AND indexrelname NOT IN (
    SELECT conname
    FROM pg_constraint
    WHERE contype IN ('p', 'u')
  )
ORDER BY pg_relation_size(indexrelid) DESC;

\echo ''
\echo '================================================'
\echo 'Analysis Complete'
\echo '================================================'
\echo ''
\echo 'Statistics last reset:'
SELECT stats_reset FROM pg_stat_database WHERE datname = current_database();
