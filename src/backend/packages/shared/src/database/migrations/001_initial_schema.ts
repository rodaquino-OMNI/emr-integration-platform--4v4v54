// knex v2.5.1
import { Knex } from 'knex';
import { EMR_SYSTEMS } from '../types/common.types';

// Schema version for tracking
const SCHEMA_VERSION = '1.0.0';

/**
 * Creates the initial database schema with HIPAA-compliant tables and comprehensive audit logging
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  // Create custom enum types
  await knex.raw(`
    CREATE TYPE task_status AS ENUM (
      'TO_DO', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'PENDING_VERIFICATION'
    );
    CREATE TYPE task_priority AS ENUM (
      'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    );
    CREATE TYPE user_role AS ENUM (
      'NURSE', 'DOCTOR', 'ADMIN', 'SUPERVISOR'
    );
    CREATE TYPE emr_system AS ENUM (
      '${EMR_SYSTEMS.EPIC}', '${EMR_SYSTEMS.CERNER}', '${EMR_SYSTEMS.GENERIC_FHIR}'
    );
    CREATE TYPE verification_status AS ENUM (
      'PENDING', 'VERIFIED', 'FAILED', 'EXPIRED'
    );
  `);

  // Create users table with RBAC
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('username').notNullable().unique();
    table.string('email').notNullable().unique();
    table.specificType('role', 'user_role').notNullable();
    table.string('password_hash').notNullable();
    table.string('mfa_secret').nullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('last_login').nullable();
    table.jsonb('preferences').defaultTo('{}');
    table.timestamps(true, true);
    table.timestamp('deleted_at').nullable();
  });

  // Create departments table
  await knex.schema.createTable('departments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('name').notNullable();
    table.string('code').notNullable().unique();
    table.text('description').nullable();
    table.timestamps(true, true);
  });

  // Create shifts table
  await knex.schema.createTable('shifts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('department_id').notNullable().references('id').inTable('departments');
    table.timestamp('start_time').notNullable();
    table.timestamp('end_time').notNullable();
    table.uuid('supervisor_id').notNullable().references('id').inTable('users');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamps(true, true);
  });

  // Create tasks table with EMR integration
  await knex.schema.createTable('tasks', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('title').notNullable();
    table.text('description').nullable();
    table.specificType('status', 'task_status').notNullable().defaultTo('TO_DO');
    table.specificType('priority', 'task_priority').notNullable().defaultTo('MEDIUM');
    table.uuid('assigned_to').references('id').inTable('users').nullable();
    table.uuid('created_by').references('id').inTable('users').notNullable();
    table.uuid('department_id').references('id').inTable('departments').notNullable();
    table.uuid('shift_id').references('id').inTable('shifts').nullable();
    table.timestamp('due_date').nullable();
    table.specificType('emr_system', 'emr_system').notNullable();
    table.string('patient_id').notNullable();
    table.jsonb('emr_data').notNullable();
    table.bigint('vector_clock').notNullable();
    table.integer('version').notNullable().defaultTo(1);
    table.boolean('requires_verification').notNullable().defaultTo(false);
    table.timestamps(true, true);
    table.timestamp('deleted_at').nullable();
  });

  // Create EMR verifications table
  await knex.schema.createTable('emr_verifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('task_id').references('id').inTable('tasks').notNullable();
    table.uuid('verified_by').references('id').inTable('users').notNullable();
    table.specificType('status', 'verification_status').notNullable();
    table.string('barcode_data').nullable();
    table.jsonb('verification_metadata').notNullable();
    table.text('failure_reason').nullable();
    table.timestamp('verified_at').notNullable();
    table.timestamps(true, true);
  });

  // Create handovers table
  await knex.schema.createTable('handovers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('from_shift_id').references('id').inTable('shifts').notNullable();
    table.uuid('to_shift_id').references('id').inTable('shifts').notNullable();
    table.uuid('initiated_by').references('id').inTable('users').notNullable();
    table.uuid('accepted_by').references('id').inTable('users').nullable();
    table.jsonb('task_summary').notNullable();
    table.jsonb('critical_events').notNullable();
    table.boolean('is_completed').notNullable().defaultTo(false);
    table.timestamp('completed_at').nullable();
    table.timestamps(true, true);
  });

  // Create audit_logs table
  await knex.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').references('id').inTable('users').notNullable();
    table.string('action').notNullable();
    table.string('entity_type').notNullable();
    table.uuid('entity_id').notNullable();
    table.jsonb('changes').notNullable();
    table.string('ip_address').notNullable();
    table.string('user_agent').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  // Create indexes for performance optimization
  await knex.schema.alterTable('tasks', (table) => {
    table.index(['department_id', 'status', 'due_date']);
    table.index(['assigned_to', 'status']);
    table.index(['patient_id', 'emr_system']);
    table.index('vector_clock');
  });

  await knex.schema.alterTable('audit_logs', (table) => {
    table.index(['entity_type', 'entity_id']);
    table.index('created_at');
  });

  // Set up row-level security policies
  await knex.raw(`
    ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
    CREATE POLICY task_access_policy ON tasks
    USING (
      department_id IN (
        SELECT department_id FROM users WHERE id = current_user_id()
      )
    );
  `);
}

/**
 * Rolls back the initial schema migration while preserving audit logs
 */
export async function down(knex: Knex): Promise<void> {
  // Preserve audit logs by copying to a backup table
  await knex.raw(`
    CREATE TABLE audit_logs_backup AS
    SELECT * FROM audit_logs;
  `);

  // Drop tables in reverse order
  await knex.schema.dropTableIfExists('audit_logs');
  await knex.schema.dropTableIfExists('handovers');
  await knex.schema.dropTableIfExists('emr_verifications');
  await knex.schema.dropTableIfExists('tasks');
  await knex.schema.dropTableIfExists('shifts');
  await knex.schema.dropTableIfExists('departments');
  await knex.schema.dropTableIfExists('users');

  // Drop custom enum types
  await knex.raw(`
    DROP TYPE IF EXISTS task_status;
    DROP TYPE IF EXISTS task_priority;
    DROP TYPE IF EXISTS user_role;
    DROP TYPE IF EXISTS emr_system;
    DROP TYPE IF EXISTS verification_status;
  `);
}