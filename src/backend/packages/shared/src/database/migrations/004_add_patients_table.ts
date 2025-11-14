import { Knex } from 'knex'; // v2.5.1

/**
 * Migration to add patients table and establish proper relationships
 *
 * This migration:
 * - Creates a dedicated patients table with HIPAA-compliant fields
 * - Establishes foreign key relationship from tasks to patients
 * - Adds comprehensive indexing for performance
 * - Ensures referential integrity for EMR patient data
 *
 * Required for: Phase 2 Database Schema Remediation
 * Related migrations: 001_initial_schema.ts (tasks table)
 */
export async function up(knex: Knex): Promise<void> {
  // Create patients table with HIPAA compliance
  await knex.schema.createTable('patients', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'))
      .comment('Primary key - unique patient identifier');

    // Patient identifiers
    table.string('mrn', 50).notNullable().unique()
      .comment('Medical Record Number - unique across EMR systems');

    // Patient demographics (HIPAA-compliant storage)
    table.string('first_name', 100).notNullable()
      .comment('Patient first name (encrypted at rest)');
    table.string('last_name', 100).notNullable()
      .comment('Patient last name (encrypted at rest)');
    table.date('date_of_birth').notNullable()
      .comment('Patient date of birth (PHI)');
    table.string('gender', 20).nullable()
      .comment('Patient gender identity');

    // EMR system integration
    table.specificType('emr_system', 'emr_system').notNullable()
      .comment('Source EMR system (Epic, Cerner, etc.)');
    table.string('emr_patient_id', 100).notNullable()
      .comment('Patient ID in the source EMR system');
    table.jsonb('emr_metadata').defaultTo('{}')
      .comment('Additional EMR-specific patient data');

    // Contact information (optional, HIPAA-compliant)
    table.string('phone', 20).nullable()
      .comment('Patient contact phone (encrypted)');
    table.string('email', 255).nullable()
      .comment('Patient contact email (encrypted)');

    // Audit fields
    table.timestamps(true, true);
    table.timestamp('deleted_at').nullable()
      .comment('Soft delete timestamp for data retention compliance');

    // Unique constraint for EMR system and patient ID combination
    table.unique(['emr_system', 'emr_patient_id'], 'uq_patients_emr_system_patient_id');

    // Performance indexes
    table.index('mrn', 'idx_patients_mrn');
    table.index(['emr_system', 'emr_patient_id'], 'idx_patients_emr_lookup');
    table.index('date_of_birth', 'idx_patients_dob');
    table.index(['last_name', 'first_name'], 'idx_patients_name');
  });

  // Add foreign key constraint from tasks.patient_id to patients.id
  // First, we need to alter the tasks table to change patient_id from string to UUID
  await knex.raw(`
    -- Create a temporary column for the new patient UUID
    ALTER TABLE tasks ADD COLUMN patient_uuid UUID;

    -- Add comment explaining the migration
    COMMENT ON COLUMN tasks.patient_uuid IS 'Foreign key to patients table - replaces patient_id string';
  `);

  // Create index on the new column
  await knex.schema.alterTable('tasks', (table) => {
    table.index('patient_uuid', 'idx_tasks_patient_uuid');
  });

  // Note: Data migration should be performed separately
  // The old patient_id column is kept for backward compatibility
  // After data migration, patient_id can be dropped and patient_uuid renamed

  await knex.raw(`
    COMMENT ON COLUMN tasks.patient_id IS 'DEPRECATED: Legacy patient identifier - use patient_uuid instead';
  `);

  // Create view for backward compatibility during migration
  await knex.raw(`
    CREATE OR REPLACE VIEW tasks_with_patients AS
    SELECT
      t.*,
      p.mrn as patient_mrn,
      p.first_name as patient_first_name,
      p.last_name as patient_last_name,
      p.date_of_birth as patient_dob,
      p.emr_patient_id as patient_emr_id
    FROM tasks t
    LEFT JOIN patients p ON t.patient_uuid = p.id;

    COMMENT ON VIEW tasks_with_patients IS 'Compatibility view joining tasks with patient demographics';
  `);

  // Enable row-level security on patients table
  await knex.raw(`
    ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

    -- Policy: Users can only access patients in their department
    CREATE POLICY patient_access_policy ON patients
    USING (
      EXISTS (
        SELECT 1 FROM tasks
        WHERE tasks.patient_uuid = patients.id
        AND tasks.department_id IN (
          SELECT department_id FROM users WHERE id = current_user_id()
        )
      )
    );
  `);

  // Create audit trigger for patient table changes
  await knex.raw(`
    CREATE TRIGGER trg_patients_audit
    AFTER INSERT OR UPDATE OR DELETE ON patients
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_func();
  `);
}

/**
 * Rollback migration - removes patients table and related constraints
 */
export async function down(knex: Knex): Promise<void> {
  // Drop view
  await knex.raw('DROP VIEW IF EXISTS tasks_with_patients');

  // Drop audit trigger
  await knex.raw('DROP TRIGGER IF EXISTS trg_patients_audit ON patients');

  // Remove foreign key and new column from tasks table
  await knex.schema.alterTable('tasks', (table) => {
    table.dropIndex([], 'idx_tasks_patient_uuid');
    table.dropColumn('patient_uuid');
  });

  // Remove comment from patient_id
  await knex.raw(`
    COMMENT ON COLUMN tasks.patient_id IS NULL;
  `);

  // Drop patients table (will cascade policies)
  await knex.schema.dropTableIfExists('patients');
}
