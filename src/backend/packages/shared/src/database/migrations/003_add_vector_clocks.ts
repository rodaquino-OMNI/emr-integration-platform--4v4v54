import { Knex } from 'knex'; // ^2.5.1
import { VectorClock } from '../../types/common.types';

/**
 * Migration to add vector clock support for CRDT-based synchronization
 * Enables offline-first capabilities with conflict-free updates
 * Target sync resolution time: < 500ms for 95th percentile
 */
export async function up(knex: Knex): Promise<void> {
  // Create pgcrypto extension for UUID generation if not exists
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  // Create trigger function for auto-updating vector clock timestamp
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_vector_clock_timestamp()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.vector_clock_timestamp = CAST(EXTRACT(EPOCH FROM NOW()) * 1000000 AS BIGINT);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Add vector clock columns to tasks table
  await knex.schema.alterTable('tasks', (table) => {
    table.string('vector_clock_node_id', 50).notNullable()
      .comment('Node identifier for CRDT vector clock');
    table.bigInteger('vector_clock_counter').notNullable().defaultTo(0)
      .comment('Logical counter for CRDT operations');
    table.bigInteger('vector_clock_timestamp').notNullable()
      .defaultTo(knex.raw('CAST(EXTRACT(EPOCH FROM NOW()) * 1000000 AS BIGINT)'))
      .comment('Hybrid logical clock timestamp in microseconds');
    
    // Create composite index for vector clock components
    table.index(
      ['vector_clock_node_id', 'vector_clock_counter', 'vector_clock_timestamp'],
      'idx_tasks_vector_clock'
    );
    
    // Create BRIN index for timestamp range queries
    table.index('vector_clock_timestamp', 'idx_tasks_vector_timestamp', 'BRIN');
    
    // Add constraints
    table.check(
      'vector_clock_counter >= 0',
      'chk_tasks_vector_clock_counter_positive'
    );
    table.check(
      'vector_clock_timestamp > 0',
      'chk_tasks_vector_clock_timestamp_positive'
    );
  });

  // Add vector clock columns to handovers table
  await knex.schema.alterTable('handovers', (table) => {
    table.string('vector_clock_node_id', 50).notNullable()
      .comment('Node identifier for CRDT vector clock');
    table.bigInteger('vector_clock_counter').notNullable().defaultTo(0)
      .comment('Logical counter for CRDT operations');
    table.bigInteger('vector_clock_timestamp').notNullable()
      .defaultTo(knex.raw('CAST(EXTRACT(EPOCH FROM NOW()) * 1000000 AS BIGINT)'))
      .comment('Hybrid logical clock timestamp in microseconds');
    
    // Create composite index for vector clock components
    table.index(
      ['vector_clock_node_id', 'vector_clock_counter', 'vector_clock_timestamp'],
      'idx_handovers_vector_clock'
    );
    
    // Create BRIN index for timestamp range queries
    table.index('vector_clock_timestamp', 'idx_handovers_vector_timestamp', 'BRIN');
    
    // Add constraints
    table.check(
      'vector_clock_counter >= 0',
      'chk_handovers_vector_clock_counter_positive'
    );
    table.check(
      'vector_clock_timestamp > 0',
      'chk_handovers_vector_clock_timestamp_positive'
    );
  });

  // Add vector clock columns to task_verifications table
  await knex.schema.alterTable('task_verifications', (table) => {
    table.string('vector_clock_node_id', 50).notNullable()
      .comment('Node identifier for CRDT vector clock');
    table.bigInteger('vector_clock_counter').notNullable().defaultTo(0)
      .comment('Logical counter for CRDT operations');
    table.bigInteger('vector_clock_timestamp').notNullable()
      .defaultTo(knex.raw('CAST(EXTRACT(EPOCH FROM NOW()) * 1000000 AS BIGINT)'))
      .comment('Hybrid logical clock timestamp in microseconds');
    
    // Create composite index for vector clock components
    table.index(
      ['vector_clock_node_id', 'vector_clock_counter', 'vector_clock_timestamp'],
      'idx_task_verifications_vector_clock'
    );
    
    // Create BRIN index for timestamp range queries
    table.index('vector_clock_timestamp', 'idx_task_verifications_vector_timestamp', 'BRIN');
    
    // Add constraints
    table.check(
      'vector_clock_counter >= 0',
      'chk_task_verifications_vector_clock_counter_positive'
    );
    table.check(
      'vector_clock_timestamp > 0',
      'chk_task_verifications_vector_clock_timestamp_positive'
    );
  });

  // Add triggers for auto-updating vector clock timestamp
  await knex.raw(`
    CREATE TRIGGER trg_tasks_vector_clock_timestamp
    BEFORE INSERT OR UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_vector_clock_timestamp();
  `);

  await knex.raw(`
    CREATE TRIGGER trg_handovers_vector_clock_timestamp
    BEFORE INSERT OR UPDATE ON handovers
    FOR EACH ROW
    EXECUTE FUNCTION update_vector_clock_timestamp();
  `);

  await knex.raw(`
    CREATE TRIGGER trg_task_verifications_vector_clock_timestamp
    BEFORE INSERT OR UPDATE ON task_verifications
    FOR EACH ROW
    EXECUTE FUNCTION update_vector_clock_timestamp();
  `);
}

/**
 * Rollback migration by removing vector clock columns and related objects
 */
export async function down(knex: Knex): Promise<void> {
  // Drop triggers
  await knex.raw('DROP TRIGGER IF EXISTS trg_tasks_vector_clock_timestamp ON tasks');
  await knex.raw('DROP TRIGGER IF EXISTS trg_handovers_vector_clock_timestamp ON handovers');
  await knex.raw('DROP TRIGGER IF EXISTS trg_task_verifications_vector_clock_timestamp ON task_verifications');
  
  // Drop trigger function
  await knex.raw('DROP FUNCTION IF EXISTS update_vector_clock_timestamp()');

  // Remove vector clock columns from tasks table
  await knex.schema.alterTable('tasks', (table) => {
    table.dropIndex([], 'idx_tasks_vector_clock');
    table.dropIndex([], 'idx_tasks_vector_timestamp');
    table.dropColumn('vector_clock_node_id');
    table.dropColumn('vector_clock_counter');
    table.dropColumn('vector_clock_timestamp');
  });

  // Remove vector clock columns from handovers table
  await knex.schema.alterTable('handovers', (table) => {
    table.dropIndex([], 'idx_handovers_vector_clock');
    table.dropIndex([], 'idx_handovers_vector_timestamp');
    table.dropColumn('vector_clock_node_id');
    table.dropColumn('vector_clock_counter');
    table.dropColumn('vector_clock_timestamp');
  });

  // Remove vector clock columns from task_verifications table
  await knex.schema.alterTable('task_verifications', (table) => {
    table.dropIndex([], 'idx_task_verifications_vector_clock');
    table.dropIndex([], 'idx_task_verifications_vector_timestamp');
    table.dropColumn('vector_clock_node_id');
    table.dropColumn('vector_clock_counter');
    table.dropColumn('vector_clock_timestamp');
  });
}