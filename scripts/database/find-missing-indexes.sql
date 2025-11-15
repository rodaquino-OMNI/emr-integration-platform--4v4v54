-- ============================================================================
-- Find Missing Indexes Script
-- ============================================================================
-- Purpose: Identify potential missing indexes based on query patterns
-- Usage: psql -d emr_platform -f find-missing-indexes.sql
-- ============================================================================

\echo '================================================'
\echo 'EMR Platform - Missing Index Detection'
\echo '================================================'
\echo ''

-- ============================================================================
-- 1. TABLES WITH HIGH SEQUENTIAL SCANS (Missing Index Candidates)
-- ============================================================================
\echo '1. TABLES WITH EXCESSIVE SEQUENTIAL SCANS'
\echo '------------------------------------------'
\echo 'Tables frequently scanned sequentially may benefit from indexes'
\echo ''

SELECT
  schemaname,
  tablename,
  seq_scan,
  seq_tup_read,
  idx_scan,
  n_live_tup AS rows,
  CASE
    WHEN seq_scan > 0
    THEN ROUND((seq_tup_read::numeric / seq_scan), 0)
    ELSE 0
  END AS avg_rows_per_scan,
  CASE
    WHEN seq_scan + idx_scan > 0
    THEN ROUND((100.0 * seq_scan / (seq_scan + idx_scan))::numeric, 2)
    ELSE 0
  END AS seq_scan_percent,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size
FROM pg_stat_user_tables
WHERE seq_scan > 100
  AND n_live_tup > 1000
  AND (idx_scan = 0 OR seq_scan > idx_scan * 2)
ORDER BY seq_scan DESC, n_live_tup DESC
LIMIT 20;

\echo ''

-- ============================================================================
-- 2. FOREIGN KEY COLUMNS WITHOUT INDEXES
-- ============================================================================
\echo '2. FOREIGN KEY COLUMNS WITHOUT INDEXES'
\echo '---------------------------------------'
\echo 'Foreign keys without indexes can cause performance issues'
\echo ''

SELECT
  tc.table_schema,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = tc.table_schema
      AND tablename = tc.table_name
      AND indexdef LIKE '%' || kcu.column_name || '%'
  )
ORDER BY tc.table_name, kcu.column_name;

\echo ''

-- ============================================================================
-- 3. COLUMNS FREQUENTLY USED IN WHERE CLAUSES (from pg_stat_statements)
-- ============================================================================
\echo '3. FREQUENTLY FILTERED COLUMNS (potential index candidates)'
\echo '------------------------------------------------------------'
\echo 'Note: Requires pg_stat_statements extension'
\echo ''

WITH frequent_filters AS (
  SELECT
    query,
    calls
  FROM pg_stat_statements
  WHERE query LIKE '%WHERE%'
    AND calls > 100
  ORDER BY calls DESC
  LIMIT 50
)
SELECT
  'Check queries manually for common WHERE clause patterns' AS recommendation,
  COUNT(*) AS query_count,
  SUM(calls) AS total_calls
FROM frequent_filters;

\echo ''
\echo 'Sample high-frequency queries to analyze:'
SELECT
  LEFT(query, 120) AS query_preview,
  calls
FROM pg_stat_statements
WHERE query LIKE '%WHERE%'
  AND calls > 100
ORDER BY calls DESC
LIMIT 10;

\echo ''

-- ============================================================================
-- 4. TABLES WITH LOW INDEX USAGE
-- ============================================================================
\echo '4. TABLES WITH LOW INDEX USAGE RATIO'
\echo '-------------------------------------'
\echo 'Tables where indexes exist but are rarely used'
\echo ''

SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan AS index_scans,
  idx_tup_read AS rows_read,
  idx_tup_fetch AS rows_fetched,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
  CASE
    WHEN idx_scan > 0
    THEN ROUND((idx_tup_fetch::numeric / idx_scan), 2)
    ELSE 0
  END AS avg_rows_per_scan
FROM pg_stat_user_indexes
JOIN pg_indexes USING (schemaname, tablename, indexname)
WHERE idx_scan < 50
  AND pg_relation_size(indexrelid) > 1024 * 1024  -- > 1MB
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 15;

\echo ''

-- ============================================================================
-- 5. SPECIFIC RECOMMENDATIONS FOR EMR PLATFORM TABLES
-- ============================================================================
\echo '5. EMR PLATFORM SPECIFIC RECOMMENDATIONS'
\echo '-----------------------------------------'
\echo ''

-- Check tasks table
\echo 'TASKS TABLE:'
SELECT
  'tasks' AS table_name,
  CASE
    WHEN seq_scan > idx_scan * 2
    THEN 'WARNING: High sequential scans - review query patterns'
    WHEN idx_scan > seq_scan * 10
    THEN 'OK: Good index usage'
    ELSE 'REVIEW: Mixed scan patterns'
  END AS status,
  seq_scan,
  idx_scan,
  n_live_tup AS rows
FROM pg_stat_user_tables
WHERE tablename = 'tasks';

\echo ''

-- Check audit_logs table
\echo 'AUDIT_LOGS TABLE:'
SELECT
  'audit_logs' AS table_name,
  CASE
    WHEN seq_scan > idx_scan
    THEN 'REVIEW: Consider time-based partitioning or additional indexes'
    ELSE 'OK: Index usage acceptable'
  END AS status,
  seq_scan,
  idx_scan,
  n_live_tup AS rows,
  pg_size_pretty(pg_total_relation_size('public.audit_logs')) AS total_size
FROM pg_stat_user_tables
WHERE tablename = 'audit_logs';

\echo ''

-- Check users table
\echo 'USERS TABLE:'
SELECT
  'users' AS table_name,
  CASE
    WHEN seq_scan > 100
    THEN 'REVIEW: High sequential scans on users table'
    ELSE 'OK'
  END AS status,
  seq_scan,
  idx_scan,
  n_live_tup AS rows
FROM pg_stat_user_tables
WHERE tablename = 'users';

\echo ''

-- ============================================================================
-- 6. RECOMMENDED INDEXES TO CREATE
-- ============================================================================
\echo '6. RECOMMENDED INDEXES TO CREATE'
\echo '---------------------------------'
\echo ''
\echo 'Based on common query patterns for EMR platforms:'
\echo ''
\echo '-- For tasks table (if not already present):'
\echo 'CREATE INDEX CONCURRENTLY idx_tasks_status_priority ON tasks(status, priority);'
\echo 'CREATE INDEX CONCURRENTLY idx_tasks_assigned_to_status ON tasks(assigned_to, status) WHERE assigned_to IS NOT NULL;'
\echo 'CREATE INDEX CONCURRENTLY idx_tasks_due_date ON tasks(due_date) WHERE due_date IS NOT NULL;'
\echo 'CREATE INDEX CONCURRENTLY idx_tasks_patient_id ON tasks(patient_id);'
\echo 'CREATE INDEX CONCURRENTLY idx_tasks_emr_system ON tasks(emr_system);'
\echo ''
\echo '-- For audit_logs table (if not already present):'
\echo 'CREATE INDEX CONCURRENTLY idx_audit_logs_user_id_created ON audit_logs(user_id, created_at DESC);'
\echo 'CREATE INDEX CONCURRENTLY idx_audit_logs_entity ON audit_logs(entity_type, entity_id);'
\echo 'CREATE INDEX CONCURRENTLY idx_audit_logs_action ON audit_logs(action, created_at DESC);'
\echo ''
\echo '-- For emr_verifications table:'
\echo 'CREATE INDEX CONCURRENTLY idx_emr_verifications_task_id ON emr_verifications(task_id);'
\echo 'CREATE INDEX CONCURRENTLY idx_emr_verifications_status ON emr_verifications(status, verified_at);'
\echo ''
\echo '-- For handovers table:'
\echo 'CREATE INDEX CONCURRENTLY idx_handovers_shifts ON handovers(from_shift_id, to_shift_id);'
\echo 'CREATE INDEX CONCURRENTLY idx_handovers_completed ON handovers(is_completed, created_at DESC);'
\echo ''

-- ============================================================================
-- 7. EXISTING INDEXES CHECK
-- ============================================================================
\echo '7. CURRENT INDEX COVERAGE'
\echo '-------------------------'
\echo ''

SELECT
  schemaname,
  tablename,
  COUNT(*) AS index_count,
  pg_size_pretty(SUM(pg_relation_size(indexrelid))) AS total_index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
GROUP BY schemaname, tablename
ORDER BY tablename;

\echo ''

-- ============================================================================
-- 8. PARTIAL INDEX OPPORTUNITIES
-- ============================================================================
\echo '8. PARTIAL INDEX OPPORTUNITIES'
\echo '-------------------------------'
\echo 'Tables with filterable columns (boolean, status) are candidates for partial indexes'
\echo ''

SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    data_type = 'boolean'
    OR column_name LIKE '%status%'
    OR column_name LIKE '%is_%'
    OR column_name LIKE '%deleted%'
  )
ORDER BY table_name, column_name;

\echo ''
\echo 'Examples of partial indexes:'
\echo 'CREATE INDEX idx_tasks_active ON tasks(assigned_to) WHERE status != ''COMPLETED'';'
\echo 'CREATE INDEX idx_users_active ON users(email) WHERE is_active = true AND deleted_at IS NULL;'
\echo ''

-- ============================================================================
-- 9. JSONB COLUMN INDEX OPPORTUNITIES
-- ============================================================================
\echo '9. JSONB COLUMN INDEX OPPORTUNITIES'
\echo '------------------------------------'
\echo ''

SELECT
  table_name,
  column_name,
  'CREATE INDEX idx_' || table_name || '_' || column_name || '_gin ON ' ||
  table_name || ' USING GIN (' || column_name || ' jsonb_path_ops);' AS suggested_index
FROM information_schema.columns
WHERE table_schema = 'public'
  AND data_type = 'jsonb'
ORDER BY table_name, column_name;

\echo ''
\echo '================================================'
\echo 'Analysis Complete'
\echo '================================================'
