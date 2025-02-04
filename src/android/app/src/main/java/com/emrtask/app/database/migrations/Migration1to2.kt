import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/**
 * Room database migration from version 1 to 2.
 * Implements:
 * - Comprehensive HIPAA-compliant audit logging
 * - CRDT support for offline-first synchronization
 * - Performance optimized indexes
 * - Data integrity constraints
 *
 * @version 2.5.0 Room Database
 * @version 2.3.0 SQLite Support Library
 */
class Migration1to2 : Migration(1, 2) {

    override fun migrate(database: SupportSQLiteDatabase) {
        try {
            // Create audit_logs table for HIPAA-compliant tracking
            database.execSQL("""
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id TEXT PRIMARY KEY NOT NULL,
                    event_type TEXT NOT NULL,
                    timestamp INTEGER NOT NULL,
                    user_id TEXT NOT NULL,
                    task_id TEXT,
                    handover_id TEXT,
                    emr_system_id TEXT,
                    emr_data_accessed TEXT,
                    user_role TEXT NOT NULL,
                    ip_address TEXT NOT NULL,
                    device_info TEXT NOT NULL,
                    status_change TEXT,
                    verification_status TEXT,
                    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
                    FOREIGN KEY (handover_id) REFERENCES handovers(id) ON DELETE SET NULL
                )
            """.trimIndent())

            // Create vector_clocks table for CRDT support
            database.execSQL("""
                CREATE TABLE IF NOT EXISTS vector_clocks (
                    id TEXT PRIMARY KEY NOT NULL,
                    node_id TEXT NOT NULL,
                    counter INTEGER NOT NULL,
                    timestamp INTEGER NOT NULL,
                    last_sync INTEGER,
                    sync_status TEXT NOT NULL
                )
            """.trimIndent())

            // Add version tracking to tasks table
            database.execSQL("""
                ALTER TABLE tasks 
                ADD COLUMN version TEXT NOT NULL DEFAULT '1'
            """.trimIndent())

            // Create performance optimization indexes
            database.execSQL("""
                CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp 
                ON audit_logs(timestamp)
            """.trimIndent())

            database.execSQL("""
                CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id 
                ON audit_logs(user_id)
            """.trimIndent())

            database.execSQL("""
                CREATE INDEX IF NOT EXISTS idx_audit_logs_task_id 
                ON audit_logs(task_id)
            """.trimIndent())

            database.execSQL("""
                CREATE INDEX IF NOT EXISTS idx_vector_clocks_node 
                ON vector_clocks(node_id, timestamp)
            """.trimIndent())

            // Create trigger for automatic vector clock updates
            database.execSQL("""
                CREATE TRIGGER IF NOT EXISTS update_vector_clock 
                AFTER UPDATE ON tasks
                BEGIN
                    INSERT OR REPLACE INTO vector_clocks (
                        id,
                        node_id,
                        counter,
                        timestamp,
                        sync_status
                    )
                    VALUES (
                        NEW.id,
                        (SELECT COALESCE(MAX(node_id), device_id()) FROM vector_clocks),
                        COALESCE((SELECT MAX(counter) FROM vector_clocks WHERE node_id = device_id()), 0) + 1,
                        strftime('%s', 'now'),
                        'PENDING'
                    );
                END;
            """.trimIndent())

            // Create trigger for automatic audit logging
            database.execSQL("""
                CREATE TRIGGER IF NOT EXISTS log_task_changes 
                AFTER UPDATE ON tasks
                BEGIN
                    INSERT INTO audit_logs (
                        id,
                        event_type,
                        timestamp,
                        user_id,
                        task_id,
                        user_role,
                        ip_address,
                        device_info,
                        status_change
                    )
                    VALUES (
                        hex(randomblob(16)),
                        CASE
                            WHEN NEW.status != OLD.status THEN 'TASK_STATUS_CHANGED'
                            ELSE 'TASK_UPDATED'
                        END,
                        strftime('%s', 'now'),
                        current_user_id(),
                        NEW.id,
                        current_user_role(),
                        current_ip_address(),
                        current_device_info(),
                        CASE
                            WHEN NEW.status != OLD.status 
                            THEN json_object('from', OLD.status, 'to', NEW.status)
                            ELSE NULL
                        END
                    );
                END;
            """.trimIndent())

            // Create indexes for foreign key constraints
            database.execSQL("""
                CREATE INDEX IF NOT EXISTS idx_audit_logs_handover 
                ON audit_logs(handover_id)
            """.trimIndent())

            // Verify data integrity
            database.execSQL("PRAGMA foreign_key_check")

        } catch (e: Exception) {
            // Log migration failure
            database.execSQL("INSERT INTO migration_errors (version, error, timestamp) VALUES (2, ?, strftime('%s', 'now'))", 
                arrayOf(e.toString()))
            throw e
        }
    }
}