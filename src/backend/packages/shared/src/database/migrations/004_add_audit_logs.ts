import { Knex } from 'knex'; // v2.5.1
import { EMR_SYSTEMS } from '../types/common.types';

// Audit action types
const AUDIT_ACTION_ENUM = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'LOGIN',
  'LOGOUT',
  'EMR_VERIFY',
  'EPIC_VERIFY',
  'CERNER_VERIFY'
] as const;

// Configuration constants
const RETENTION_PERIOD_DAYS = 2555; // 7 years for healthcare compliance
const PARTITION_INTERVAL_DAYS = 30; // Monthly partitions
const HOT_DATA_THRESHOLD_DAYS = 90; // Recent data optimization

export async function up(knex: Knex): Promise<void> {
  // Create audit_logs table with EMR tracking
  await knex.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('action').notNullable().checkIn(AUDIT_ACTION_ENUM);
    table.string('entity_type').notNullable().index();
    table.uuid('entity_id').notNullable().index();
    table.uuid('user_id').notNullable().index();
    table.jsonb('changes').notNullable();
    table.timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table.string('ip_address');
    table.string('user_agent');
    table.uuid('session_id');
    table.string('emr_system').checkIn(Object.values(EMR_SYSTEMS));
    table.string('emr_patient_id').index();
    table.jsonb('emr_context');
    table.uuid('request_id').notNullable();
    table.jsonb('metadata');

    // Optimized indexes
    table.index(['created_at'], 'idx_audit_logs_created_at_brin', 'brin');
    table.index(['entity_type', 'entity_id']);
    table.index(['emr_system', 'emr_patient_id']);
  });

  // Create audit_log_details for extended data
  await knex.schema.createTable('audit_log_details', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('audit_log_id')
      .notNullable()
      .references('id')
      .inTable('audit_logs')
      .onDelete('CASCADE');
    table.jsonb('previous_state');
    table.jsonb('new_state');
    table.jsonb('validation_results');
    table.specificType('performance_metrics', 'jsonb[]');
    table.timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    // Optimized indexes
    table.index('audit_log_id');
    table.index(['created_at'], 'idx_audit_log_details_created_at_brin', 'brin');
  });

  // Create partitioning function
  await knex.raw(`
    CREATE OR REPLACE FUNCTION create_audit_partition()
    RETURNS trigger AS $$
    DECLARE
      partition_date text;
      partition_name text;
    BEGIN
      partition_date := to_char(NEW.created_at, 'YYYY_MM');
      partition_name := 'audit_logs_' || partition_date;
      
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = partition_name
      ) THEN
        EXECUTE format(
          'CREATE TABLE %I PARTITION OF audit_logs
           FOR VALUES FROM (%L) TO (%L)',
          partition_name,
          date_trunc('month', NEW.created_at),
          date_trunc('month', NEW.created_at + interval '1 month')
        );
        
        -- Create indexes on partition
        EXECUTE format(
          'CREATE INDEX %I ON %I (created_at)',
          'idx_' || partition_name || '_created_at',
          partition_name
        );
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Create partition trigger
  await knex.raw(`
    CREATE TRIGGER trigger_create_audit_partition
    BEFORE INSERT ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION create_audit_partition();
  `);

  // Create EMR verification view
  await knex.raw(`
    CREATE MATERIALIZED VIEW emr_verification_report AS
    SELECT 
      emr_system,
      date_trunc('hour', created_at) as time_bucket,
      count(*) as verification_count,
      count(*) filter (where action = 'EMR_VERIFY') as successful_verifications,
      avg(
        (metadata->>'response_time')::numeric
      ) as avg_response_time
    FROM audit_logs
    WHERE action in ('EMR_VERIFY', 'EPIC_VERIFY', 'CERNER_VERIFY')
    GROUP BY emr_system, date_trunc('hour', created_at)
    WITH DATA;

    CREATE UNIQUE INDEX idx_emr_verification_report 
    ON emr_verification_report (emr_system, time_bucket);
  `);

  // Create compliance reporting view
  await knex.raw(`
    CREATE MATERIALIZED VIEW compliance_audit_summary AS
    SELECT
      date_trunc('day', created_at) as audit_date,
      entity_type,
      action,
      count(*) as action_count,
      count(distinct user_id) as unique_users,
      count(distinct emr_patient_id) as affected_patients
    FROM audit_logs
    GROUP BY 
      date_trunc('day', created_at),
      entity_type,
      action
    WITH DATA;

    CREATE UNIQUE INDEX idx_compliance_audit_summary
    ON compliance_audit_summary (audit_date, entity_type, action);
  `);

  // Create retention policy function
  await knex.raw(`
    CREATE OR REPLACE FUNCTION enforce_audit_retention()
    RETURNS void AS $$
    DECLARE
      partition_name text;
    BEGIN
      FOR partition_name IN
        SELECT tablename 
        FROM pg_tables
        WHERE tablename LIKE 'audit_logs_%'
        AND to_date(split_part(tablename, '_', 3) || '_' || 
                   split_part(tablename, '_', 4), 'YYYY_MM')
            < current_date - interval '${RETENTION_PERIOD_DAYS} days'
      LOOP
        EXECUTE format('DROP TABLE %I', partition_name);
      END LOOP;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Schedule retention policy
  await knex.raw(`
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    
    SELECT cron.schedule(
      'audit-retention',
      '0 0 * * 0',
      $$SELECT enforce_audit_retention()$$
    );
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Remove scheduled jobs
  await knex.raw(`
    SELECT cron.unschedule('audit-retention');
  `);

  // Drop views
  await knex.raw('DROP MATERIALIZED VIEW IF EXISTS compliance_audit_summary');
  await knex.raw('DROP MATERIALIZED VIEW IF EXISTS emr_verification_report');

  // Drop triggers and functions
  await knex.raw('DROP TRIGGER IF EXISTS trigger_create_audit_partition ON audit_logs');
  await knex.raw('DROP FUNCTION IF EXISTS create_audit_partition()');
  await knex.raw('DROP FUNCTION IF EXISTS enforce_audit_retention()');

  // Drop partitioned tables (will cascade to partitions)
  await knex.schema.dropTableIfExists('audit_log_details');
  await knex.schema.dropTableIfExists('audit_logs');
}