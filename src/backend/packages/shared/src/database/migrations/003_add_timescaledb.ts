// knex v2.5.1
import { Knex } from 'knex';

/**
 * Configures TimescaleDB for time-series optimization of audit logs
 * Converts audit_logs to hypertable and sets up retention policies
 *
 * Benefits:
 * - 10-100x faster time-range queries on audit logs
 * - Automatic data compression for older data
 * - Automatic retention policy enforcement (HIPAA: 7 years)
 * - Continuous aggregate views for reporting
 */

// Configuration constants
const RETENTION_PERIOD_YEARS = 7; // HIPAA compliance requirement
const CHUNK_TIME_INTERVAL = '1 month'; // Partition size for hypertable
const COMPRESSION_AFTER = '90 days'; // Compress data older than 90 days
const REFRESH_INTERVAL = '1 hour'; // Continuous aggregate refresh frequency

export async function up(knex: Knex): Promise<void> {
  // Enable TimescaleDB extension
  await knex.raw('CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE');

  // Convert audit_logs table to hypertable (must be done after table creation in 004)
  // This migration should run after 004_add_audit_logs.ts
  await knex.raw(`
    SELECT create_hypertable(
      'audit_logs',
      'created_at',
      chunk_time_interval => INTERVAL '${CHUNK_TIME_INTERVAL}',
      if_not_exists => TRUE,
      migrate_data => TRUE
    );
  `);

  // Add compression policy for data older than 90 days
  await knex.raw(`
    ALTER TABLE audit_logs SET (
      timescaledb.compress,
      timescaledb.compress_segmentby = 'entity_type,user_id',
      timescaledb.compress_orderby = 'created_at DESC'
    );
  `);

  await knex.raw(`
    SELECT add_compression_policy(
      'audit_logs',
      INTERVAL '${COMPRESSION_AFTER}',
      if_not_exists => TRUE
    );
  `);

  // Add retention policy to drop data older than 7 years (HIPAA compliance)
  await knex.raw(`
    SELECT add_retention_policy(
      'audit_logs',
      INTERVAL '${RETENTION_PERIOD_YEARS} years',
      if_not_exists => TRUE
    );
  `);

  // Create continuous aggregate for hourly audit metrics
  await knex.raw(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS audit_metrics_hourly
    WITH (timescaledb.continuous) AS
    SELECT
      time_bucket('1 hour', created_at) AS hour_bucket,
      entity_type,
      action,
      user_id,
      emr_system,
      COUNT(*) as action_count,
      COUNT(DISTINCT entity_id) as unique_entities,
      COUNT(DISTINCT session_id) as unique_sessions,
      AVG((metadata->>'duration_ms')::numeric) as avg_duration_ms
    FROM audit_logs
    GROUP BY
      time_bucket('1 hour', created_at),
      entity_type,
      action,
      user_id,
      emr_system
    WITH NO DATA;
  `);

  // Add refresh policy for continuous aggregate
  await knex.raw(`
    SELECT add_continuous_aggregate_policy(
      'audit_metrics_hourly',
      start_offset => INTERVAL '3 hours',
      end_offset => INTERVAL '1 hour',
      schedule_interval => INTERVAL '${REFRESH_INTERVAL}',
      if_not_exists => TRUE
    );
  `);

  // Create continuous aggregate for daily compliance reporting
  await knex.raw(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS audit_compliance_daily
    WITH (timescaledb.continuous) AS
    SELECT
      time_bucket('1 day', created_at) AS day_bucket,
      entity_type,
      action,
      COUNT(*) as total_actions,
      COUNT(DISTINCT user_id) as unique_users,
      COUNT(DISTINCT emr_patient_id) as affected_patients,
      COUNT(CASE WHEN action IN ('EMR_VERIFY', 'EPIC_VERIFY', 'CERNER_VERIFY') THEN 1 END) as verification_count,
      COUNT(CASE WHEN action = 'DELETE' THEN 1 END) as deletion_count,
      COUNT(DISTINCT ip_address) as unique_ip_addresses
    FROM audit_logs
    GROUP BY
      time_bucket('1 day', created_at),
      entity_type,
      action
    WITH NO DATA;
  `);

  // Add refresh policy for daily compliance aggregate
  await knex.raw(`
    SELECT add_continuous_aggregate_policy(
      'audit_compliance_daily',
      start_offset => INTERVAL '7 days',
      end_offset => INTERVAL '1 day',
      schedule_interval => INTERVAL '1 day',
      if_not_exists => TRUE
    );
  `);

  // Create indexes optimized for TimescaleDB hypertable
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user_time
    ON audit_logs (user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_time
    ON audit_logs (entity_type, entity_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_audit_logs_emr_patient_time
    ON audit_logs (emr_system, emr_patient_id, created_at DESC)
    WHERE emr_patient_id IS NOT NULL;
  `);

  // Create helper function for querying audit logs with time bounds
  await knex.raw(`
    CREATE OR REPLACE FUNCTION get_audit_logs_time_range(
      start_time TIMESTAMPTZ,
      end_time TIMESTAMPTZ,
      p_entity_type TEXT DEFAULT NULL,
      p_user_id UUID DEFAULT NULL
    )
    RETURNS TABLE (
      id UUID,
      action TEXT,
      entity_type TEXT,
      entity_id UUID,
      user_id UUID,
      created_at TIMESTAMPTZ,
      changes JSONB
    ) AS $$
    BEGIN
      RETURN QUERY
      SELECT
        al.id,
        al.action,
        al.entity_type,
        al.entity_id,
        al.user_id,
        al.created_at,
        al.changes
      FROM audit_logs al
      WHERE
        al.created_at BETWEEN start_time AND end_time
        AND (p_entity_type IS NULL OR al.entity_type = p_entity_type)
        AND (p_user_id IS NULL OR al.user_id = p_user_id)
      ORDER BY al.created_at DESC;
    END;
    $$ LANGUAGE plpgsql STABLE;
  `);

  // Create helper function for compliance reporting
  await knex.raw(`
    CREATE OR REPLACE FUNCTION get_compliance_summary(
      start_date DATE,
      end_date DATE
    )
    RETURNS TABLE (
      action_date DATE,
      total_actions BIGINT,
      unique_users BIGINT,
      phi_accesses BIGINT,
      emr_verifications BIGINT,
      failed_authentications BIGINT
    ) AS $$
    BEGIN
      RETURN QUERY
      SELECT
        created_at::DATE as action_date,
        COUNT(*) as total_actions,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(CASE WHEN entity_type IN ('tasks', 'patients') THEN 1 END) as phi_accesses,
        COUNT(CASE WHEN action IN ('EMR_VERIFY', 'EPIC_VERIFY', 'CERNER_VERIFY') THEN 1 END) as emr_verifications,
        COUNT(CASE WHEN action = 'LOGIN' AND (changes->>'success')::boolean = false THEN 1 END) as failed_authentications
      FROM audit_logs
      WHERE created_at::DATE BETWEEN start_date AND end_date
      GROUP BY created_at::DATE
      ORDER BY action_date;
    END;
    $$ LANGUAGE plpgsql STABLE;
  `);

  // Create view for recent audit activity (last 24 hours)
  await knex.raw(`
    CREATE OR REPLACE VIEW audit_logs_recent AS
    SELECT
      id,
      action,
      entity_type,
      entity_id,
      user_id,
      created_at,
      ip_address,
      emr_system,
      emr_patient_id
    FROM audit_logs
    WHERE created_at > NOW() - INTERVAL '24 hours'
    ORDER BY created_at DESC;
  `);
}

/**
 * Rolls back TimescaleDB configuration
 * WARNING: This will not restore compressed or dropped data
 */
export async function down(knex: Knex): Promise<void> {
  // Drop views
  await knex.raw('DROP VIEW IF EXISTS audit_logs_recent');

  // Drop helper functions
  await knex.raw('DROP FUNCTION IF EXISTS get_compliance_summary(DATE, DATE)');
  await knex.raw('DROP FUNCTION IF EXISTS get_audit_logs_time_range(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID)');

  // Drop indexes
  await knex.raw('DROP INDEX IF EXISTS idx_audit_logs_emr_patient_time');
  await knex.raw('DROP INDEX IF EXISTS idx_audit_logs_entity_time');
  await knex.raw('DROP INDEX IF EXISTS idx_audit_logs_user_time');

  // Remove continuous aggregate policies
  await knex.raw(`
    SELECT remove_continuous_aggregate_policy('audit_compliance_daily', if_exists => TRUE);
  `);
  await knex.raw(`
    SELECT remove_continuous_aggregate_policy('audit_metrics_hourly', if_exists => TRUE);
  `);

  // Drop continuous aggregates
  await knex.raw('DROP MATERIALIZED VIEW IF EXISTS audit_compliance_daily');
  await knex.raw('DROP MATERIALIZED VIEW IF EXISTS audit_metrics_hourly');

  // Remove retention policy
  await knex.raw(`
    SELECT remove_retention_policy('audit_logs', if_exists => TRUE);
  `);

  // Remove compression policy
  await knex.raw(`
    SELECT remove_compression_policy('audit_logs', if_exists => TRUE);
  `);

  // Convert hypertable back to regular table
  // Note: This will decompress all compressed chunks
  await knex.raw(`
    SELECT timescaledb_pre_restore();
  `);

  // Drop TimescaleDB extension (optional - commented out to preserve other hypertables)
  // await knex.raw('DROP EXTENSION IF EXISTS timescaledb CASCADE');
}
