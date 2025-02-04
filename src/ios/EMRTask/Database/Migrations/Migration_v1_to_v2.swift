// Foundation - iOS 14.0+
import Foundation
// SQLite - v0.14.1
import SQLite

/// Implements migration from database schema version 1 to 2, adding vector clock support
/// for CRDT-based synchronization and audit logging capabilities
final class Migration_v1_to_v2: DatabaseMigration {
    // MARK: - Properties
    
    let fromVersion: Int = 1
    let toVersion: Int = 2
    let migrationId: String = "add_vector_clock_and_audit_v1_to_v2"
    private let migrationTimeout: TimeInterval
    private let logger = Logger.shared
    
    // MARK: - SQL Statements
    
    private let createAuditLogsTable = """
        CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            timestamp INTEGER NOT NULL,
            operation TEXT NOT NULL,
            table_name TEXT NOT NULL,
            record_id TEXT,
            old_value TEXT,
            new_value TEXT,
            vector_clock TEXT NOT NULL,
            user_id TEXT,
            metadata TEXT
        )
    """
    
    private let createVectorClocksTable = """
        CREATE TABLE IF NOT EXISTS vector_clocks (
            id TEXT PRIMARY KEY,
            node_id TEXT NOT NULL,
            counter INTEGER NOT NULL,
            last_updated INTEGER NOT NULL
        )
    """
    
    private let addVectorClockColumn = """
        ALTER TABLE tasks
        ADD COLUMN vector_clock TEXT NOT NULL DEFAULT '{}'
    """
    
    private let addLastModifiedColumn = """
        ALTER TABLE tasks
        ADD COLUMN last_modified INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    """
    
    private let createVectorClockIndex = """
        CREATE INDEX IF NOT EXISTS idx_tasks_vector_clock ON tasks(vector_clock)
    """
    
    private let createLastModifiedIndex = """
        CREATE INDEX IF NOT EXISTS idx_tasks_last_modified ON tasks(last_modified)
    """
    
    // MARK: - Initialization
    
    init(timeout: TimeInterval = SyncConstants.conflictResolutionTimeout) {
        self.migrationTimeout = timeout
        logger.info("Initializing migration v1 to v2 with timeout: \(timeout)s")
    }
    
    // MARK: - Migration Implementation
    
    func migrate(db: SQLite.Connection, context: MigrationContext) -> Result<Void, MigrationError> {
        let startTime = Date()
        logger.info("Starting migration from v1 to v2")
        
        do {
            try db.transaction {
                // Create audit logs table
                logger.info("Creating audit_logs table")
                try db.execute(createAuditLogsTable)
                
                // Create vector clocks table
                logger.info("Creating vector_clocks table")
                try db.execute(createVectorClocksTable)
                
                // Add vector_clock column to tasks
                logger.info("Adding vector_clock column to tasks")
                try db.execute(addVectorClockColumn)
                
                // Add last_modified column to tasks
                logger.info("Adding last_modified column to tasks")
                try db.execute(addLastModifiedColumn)
                
                // Create indexes
                logger.info("Creating indexes")
                try db.execute(createVectorClockIndex)
                try db.execute(createLastModifiedIndex)
                
                // Initialize vector clocks for existing tasks
                logger.info("Initializing vector clocks for existing tasks")
                try initializeVectorClocks(db: db, context: context)
                
                // Update schema version
                try updateSchemaVersion(db: db, context: context)
                
                // Log migration completion
                let duration = Date().timeIntervalSince(startTime)
                logger.performance("Migration completed in \(duration)s")
            }
            
            return .success(())
            
        } catch {
            logger.error("Migration failed", error: error)
            return handleMigrationError(db: db, error: error)
        }
    }
    
    // MARK: - Private Helper Methods
    
    private func initializeVectorClocks(db: SQLite.Connection, context: MigrationContext) throws {
        let initialVectorClock = context.vectorClock.description
        try db.execute("""
            UPDATE tasks
            SET vector_clock = ?,
                last_modified = strftime('%s', 'now')
            WHERE vector_clock = '{}'
        """, initialVectorClock)
    }
    
    private func updateSchemaVersion(db: SQLite.Connection, context: MigrationContext) throws {
        try db.execute("""
            INSERT INTO schema_version (
                version,
                migration_id,
                timestamp,
                vector_clock,
                metadata
            ) VALUES (?, ?, ?, ?, ?)
        """, toVersion,
            migrationId,
            Date().timeIntervalSince1970,
            context.vectorClock.description,
            context.metadata?.description ?? "null")
    }
    
    private func handleMigrationError(db: SQLite.Connection, error: Error) -> Result<Void, MigrationError> {
        switch rollback(db: db, error: error) {
        case .success:
            return .failure(.migrationFailed("Migration failed with successful rollback", error))
        case .failure(let rollbackError):
            return .failure(.rollbackFailed(rollbackError))
        }
    }
    
    // MARK: - Rollback Implementation
    
    private func rollback(db: SQLite.Connection, error: Error) -> Result<Void, MigrationError> {
        logger.info("Initiating rollback due to migration failure")
        
        do {
            try db.transaction {
                // Drop new indexes
                try db.execute("DROP INDEX IF EXISTS idx_tasks_vector_clock")
                try db.execute("DROP INDEX IF EXISTS idx_tasks_last_modified")
                
                // Remove new columns from tasks
                try db.execute("""
                    CREATE TABLE tasks_backup AS
                    SELECT id, title, description, status, due_date, assigned_to, patient_id, emr_data
                    FROM tasks
                """)
                try db.execute("DROP TABLE tasks")
                try db.execute("ALTER TABLE tasks_backup RENAME TO tasks")
                
                // Drop new tables
                try db.execute("DROP TABLE IF EXISTS vector_clocks")
                try db.execute("DROP TABLE IF EXISTS audit_logs")
                
                // Revert schema version
                try db.execute("""
                    DELETE FROM schema_version
                    WHERE version = ? AND migration_id = ?
                """, toVersion, migrationId)
                
                logger.info("Rollback completed successfully")
            }
            return .success(())
            
        } catch {
            logger.error("Rollback failed", error: error)
            return .failure(.rollbackFailed(error))
        }
    }
}