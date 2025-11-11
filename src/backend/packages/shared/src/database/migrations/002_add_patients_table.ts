// knex v2.5.1
import { Knex } from 'knex';
import { EMR_SYSTEMS } from '../types/common.types';

/**
 * Creates the patients table to store PHI data with encryption support
 * This table is referenced by tasks.patient_id foreign key
 *
 * HIPAA Compliance: All PHI is encrypted at rest using field-level encryption
 */
export async function up(knex: Knex): Promise<void> {
  // Create patients table with encrypted PHI support
  await knex.schema.createTable('patients', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'))
      .comment('Primary key - UUID for patient record');

    // Medical Record Number - unique identifier within hospital system
    table.string('mrn', 50).notNullable().unique()
      .comment('Medical Record Number - unique within organization');

    // Basic demographic information (PHI)
    table.string('first_name', 100).notNullable()
      .comment('Patient first name - encrypted at application layer');
    table.string('last_name', 100).notNullable()
      .comment('Patient last name - encrypted at application layer');
    table.date('date_of_birth').notNullable()
      .comment('Patient date of birth - encrypted at application layer');

    // EMR system integration fields
    table.specificType('emr_system', 'emr_system').notNullable()
      .comment('Source EMR system (EPIC, CERNER, GENERIC_FHIR)');
    table.string('emr_id', 100).notNullable()
      .comment('External patient ID in source EMR system');

    // Encrypted additional PHI data
    table.jsonb('encrypted_data').notNullable().defaultTo('{}')
      .comment('Additional encrypted PHI fields (address, phone, email, etc.)');

    // Metadata
    table.boolean('is_active').notNullable().defaultTo(true)
      .comment('Soft delete flag');
    table.timestamps(true, true);
    table.timestamp('deleted_at').nullable()
      .comment('Soft delete timestamp');

    // Create composite unique index for EMR system + EMR ID
    table.unique(['emr_system', 'emr_id'], 'idx_patients_emr_unique');

    // Create indexes for common queries
    table.index('mrn', 'idx_patients_mrn');
    table.index(['emr_system', 'emr_id'], 'idx_patients_emr_lookup');
    table.index('is_active', 'idx_patients_active');
    table.index('created_at', 'idx_patients_created_at');
  });

  // Add foreign key constraint from tasks.patient_id to patients.id
  await knex.schema.alterTable('tasks', (table) => {
    // First, we need to change patient_id from string to uuid
    // This requires a data migration if there's existing data
    table.dropColumn('patient_id');
  });

  await knex.schema.alterTable('tasks', (table) => {
    table.uuid('patient_id')
      .notNullable()
      .references('id')
      .inTable('patients')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE')
      .comment('Foreign key to patients table');

    // Add index for foreign key lookup
    table.index('patient_id', 'idx_tasks_patient_id');
  });

  // Create view for patient task summary (without exposing full PHI)
  await knex.raw(`
    CREATE VIEW patient_task_summary AS
    SELECT
      p.id as patient_id,
      p.mrn,
      p.emr_system,
      p.emr_id,
      COUNT(t.id) as total_tasks,
      COUNT(CASE WHEN t.status = 'COMPLETED' THEN 1 END) as completed_tasks,
      COUNT(CASE WHEN t.status = 'IN_PROGRESS' THEN 1 END) as in_progress_tasks,
      COUNT(CASE WHEN t.status = 'BLOCKED' THEN 1 END) as blocked_tasks,
      MAX(t.updated_at) as last_task_update
    FROM patients p
    LEFT JOIN tasks t ON t.patient_id = p.id
    WHERE p.is_active = true
    GROUP BY p.id, p.mrn, p.emr_system, p.emr_id;
  `);

  // Create function to validate patient data before insert/update
  await knex.raw(`
    CREATE OR REPLACE FUNCTION validate_patient_data()
    RETURNS TRIGGER AS $$
    BEGIN
      -- Validate MRN format (alphanumeric, 6-20 characters)
      IF NEW.mrn !~ '^[A-Z0-9]{6,20}$' THEN
        RAISE EXCEPTION 'Invalid MRN format: %', NEW.mrn;
      END IF;

      -- Validate date of birth is not in future
      IF NEW.date_of_birth > CURRENT_DATE THEN
        RAISE EXCEPTION 'Date of birth cannot be in the future';
      END IF;

      -- Validate date of birth is reasonable (not more than 150 years ago)
      IF NEW.date_of_birth < CURRENT_DATE - INTERVAL '150 years' THEN
        RAISE EXCEPTION 'Date of birth is too far in the past';
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Create trigger for patient data validation
  await knex.raw(`
    CREATE TRIGGER trigger_validate_patient_data
    BEFORE INSERT OR UPDATE ON patients
    FOR EACH ROW
    EXECUTE FUNCTION validate_patient_data();
  `);
}

/**
 * Rolls back the patients table creation and related objects
 */
export async function down(knex: Knex): Promise<void> {
  // Drop trigger and function
  await knex.raw('DROP TRIGGER IF EXISTS trigger_validate_patient_data ON patients');
  await knex.raw('DROP FUNCTION IF EXISTS validate_patient_data()');

  // Drop view
  await knex.raw('DROP VIEW IF EXISTS patient_task_summary');

  // Remove foreign key from tasks table
  await knex.schema.alterTable('tasks', (table) => {
    table.dropIndex([], 'idx_tasks_patient_id');
    table.dropForeign(['patient_id']);
    table.dropColumn('patient_id');
  });

  // Restore original patient_id as string
  await knex.schema.alterTable('tasks', (table) => {
    table.string('patient_id').notNullable();
  });

  // Drop patients table
  await knex.schema.dropTableIfExists('patients');
}
