-- Slow Query Benchmarks for EMR Integration Platform
-- These queries simulate real-world slow operations for performance testing

-- Query 1: Complex JOIN with aggregation
-- Tests: JOIN performance, aggregation, grouping
\timing on
SELECT
    p.id AS patient_id,
    p.first_name,
    p.last_name,
    COUNT(DISTINCT t.id) AS total_tasks,
    COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) AS completed_tasks,
    COUNT(DISTINCT CASE WHEN t.status = 'pending' THEN t.id END) AS pending_tasks,
    AVG(EXTRACT(EPOCH FROM (t.completed_at - t.created_at))) AS avg_completion_time,
    MAX(t.priority) AS highest_priority
FROM patients p
LEFT JOIN tasks t ON p.id = t.patient_id
WHERE p.created_at > NOW() - INTERVAL '30 days'
GROUP BY p.id, p.first_name, p.last_name
HAVING COUNT(t.id) > 0
ORDER BY total_tasks DESC
LIMIT 100;

-- Query 2: Subquery with EXISTS
-- Tests: Subquery optimization, EXISTS clause
SELECT
    t.id,
    t.title,
    t.priority,
    t.status,
    t.created_at
FROM tasks t
WHERE EXISTS (
    SELECT 1 FROM patients p
    WHERE p.id = t.patient_id
    AND p.status = 'active'
    AND p.created_at > NOW() - INTERVAL '90 days'
)
AND t.status IN ('pending', 'in_progress')
ORDER BY t.priority DESC, t.created_at ASC
LIMIT 500;

-- Query 3: Window function for ranking
-- Tests: Window functions, partitioning
SELECT
    patient_id,
    id AS task_id,
    title,
    priority,
    status,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY patient_id ORDER BY priority DESC, created_at DESC) AS task_rank,
    RANK() OVER (PARTITION BY status ORDER BY created_at DESC) AS status_rank,
    DENSE_RANK() OVER (ORDER BY priority DESC) AS priority_rank,
    LAG(created_at) OVER (PARTITION BY patient_id ORDER BY created_at) AS prev_task_time,
    LEAD(created_at) OVER (PARTITION BY patient_id ORDER BY created_at) AS next_task_time
FROM tasks
WHERE created_at > NOW() - INTERVAL '7 days'
LIMIT 1000;

-- Query 4: CTE with multiple levels
-- Tests: CTE optimization, recursive queries
WITH recent_patients AS (
    SELECT id, first_name, last_name, status
    FROM patients
    WHERE created_at > NOW() - INTERVAL '30 days'
),
task_counts AS (
    SELECT
        patient_id,
        COUNT(*) AS total_tasks,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed_count,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending_count
    FROM tasks
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY patient_id
),
patient_metrics AS (
    SELECT
        rp.id,
        rp.first_name,
        rp.last_name,
        rp.status,
        COALESCE(tc.total_tasks, 0) AS total_tasks,
        COALESCE(tc.completed_count, 0) AS completed_tasks,
        COALESCE(tc.pending_count, 0) AS pending_tasks,
        CASE
            WHEN tc.total_tasks > 0 THEN (tc.completed_count::float / tc.total_tasks) * 100
            ELSE 0
        END AS completion_rate
    FROM recent_patients rp
    LEFT JOIN task_counts tc ON rp.id = tc.patient_id
)
SELECT * FROM patient_metrics
WHERE total_tasks > 0
ORDER BY completion_rate DESC, total_tasks DESC
LIMIT 100;

-- Query 5: Complex aggregation with multiple CTEs
-- Tests: Multiple CTEs, complex aggregations
WITH daily_stats AS (
    SELECT
        DATE(created_at) AS date,
        status,
        priority,
        COUNT(*) AS count,
        AVG(EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - created_at))) AS avg_duration
    FROM tasks
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY DATE(created_at), status, priority
),
status_totals AS (
    SELECT
        date,
        SUM(CASE WHEN status = 'completed' THEN count ELSE 0 END) AS completed,
        SUM(CASE WHEN status = 'pending' THEN count ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'in_progress' THEN count ELSE 0 END) AS in_progress,
        SUM(count) AS total
    FROM daily_stats
    GROUP BY date
)
SELECT
    date,
    completed,
    pending,
    in_progress,
    total,
    (completed::float / NULLIF(total, 0)) * 100 AS completion_rate,
    LAG(total) OVER (ORDER BY date) AS prev_day_total,
    total - LAG(total) OVER (ORDER BY date) AS daily_change
FROM status_totals
ORDER BY date DESC;

-- Query 6: Full-text search simulation
-- Tests: Pattern matching, LIKE performance
SELECT
    id,
    title,
    description,
    status,
    priority,
    created_at,
    LENGTH(title) AS title_length,
    LENGTH(description) AS desc_length
FROM tasks
WHERE
    (title ILIKE '%medication%' OR description ILIKE '%medication%')
    OR (title ILIKE '%vitals%' OR description ILIKE '%vitals%')
    OR (title ILIKE '%lab%' OR description ILIKE '%lab%')
ORDER BY created_at DESC
LIMIT 200;

-- Query 7: Date range aggregation
-- Tests: Date functions, time-based queries
SELECT
    DATE_TRUNC('hour', created_at) AS hour,
    COUNT(*) AS tasks_created,
    COUNT(DISTINCT patient_id) AS unique_patients,
    COUNT(CASE WHEN priority = 'critical' THEN 1 END) AS critical_tasks,
    AVG(CASE WHEN completed_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (completed_at - created_at))
        ELSE NULL
    END) AS avg_completion_seconds
FROM tasks
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;

-- Query 8: Self-join for task dependencies
-- Tests: Self-join performance
SELECT
    t1.id AS task_id,
    t1.title AS task_title,
    t1.status AS task_status,
    t2.id AS related_task_id,
    t2.title AS related_title,
    t2.status AS related_status,
    EXTRACT(EPOCH FROM (t1.created_at - t2.created_at)) AS time_difference
FROM tasks t1
JOIN tasks t2 ON t1.patient_id = t2.patient_id AND t1.id != t2.id
WHERE t1.created_at > NOW() - INTERVAL '7 days'
AND ABS(EXTRACT(EPOCH FROM (t1.created_at - t2.created_at))) < 3600
ORDER BY t1.created_at DESC
LIMIT 200;

-- Query 9: Complex filtering with OR conditions
-- Tests: Query optimizer with complex WHERE clauses
SELECT
    t.id,
    t.title,
    t.priority,
    t.status,
    p.first_name,
    p.last_name,
    t.created_at
FROM tasks t
JOIN patients p ON t.patient_id = p.id
WHERE (
    (t.priority = 'critical' AND t.status = 'pending')
    OR (t.priority = 'high' AND t.status IN ('pending', 'in_progress'))
    OR (t.created_at > NOW() - INTERVAL '1 hour' AND t.status = 'pending')
    OR (p.status = 'critical' AND t.status != 'completed')
)
AND t.created_at > NOW() - INTERVAL '30 days'
ORDER BY t.priority DESC, t.created_at DESC
LIMIT 300;

-- Query 10: Percentile calculation
-- Tests: Statistical functions, ordered-set aggregates
SELECT
    priority,
    status,
    COUNT(*) AS count,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - created_at))) AS median_duration,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - created_at))) AS p95_duration,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - created_at))) AS p99_duration,
    MIN(EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - created_at))) AS min_duration,
    MAX(EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - created_at))) AS max_duration,
    AVG(EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - created_at))) AS avg_duration
FROM tasks
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY priority, status
ORDER BY priority DESC, status;

\timing off

-- Summary
\echo ''
\echo '========================================='
\echo 'Slow Query Benchmarks Complete'
\echo '========================================='
\echo 'Executed 10 complex queries for performance testing'
\echo 'Review timing results above for performance metrics'
\echo '========================================='
