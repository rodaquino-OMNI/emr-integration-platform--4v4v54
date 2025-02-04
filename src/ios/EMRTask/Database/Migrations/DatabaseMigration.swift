// Foundation - iOS 14.0+
import Foundation
// SQLite - v0.14.1
import SQLite

/// Error domain for database migrations
private let MIGRATION_ERROR_DOMAIN = "com.emrtask.database.migration"
/// Maximum time allowed for migration execution
private let MIGRATION_TIMEOUT: TimeInterval = 300.0
/// Maximum number of retry attempts for migration operations
private let MAX_RETRY_ATTEMPTS = 3

/// Context object containing metadata for migration operations
public struct MigrationContext {
    /// Vector clock for CRDT conflict resolution
    let vectorClock: [String: Int]
    /// Migration timestamp
    let timestamp: Date
    /// Optional metadata for migration
    let metadata: [String: Any]?
}

/// Comprehensive error types for database migration operations
public enum MigrationError: LocalizedError, CustomStringConvertible {
    /// Invalid version transition error
    case invalidVersion(Int, Int)
    /// General migration failure
    case migrationFailed(String, Error?)
    /// Transaction failure
    case transactionFailed(Error)
    /// Validation failure
    case validationFailed(String)
    /// Rollback failure
    case rollbackFailed(Error)
    /// CRDT conflict error
    case crdtConflict(String, Error?)
    /// Migration timeout error
    case timeout(TimeInterval)
    
    public var errorDescription: String? {
        switch self {
        case .invalidVersion(let from, let to):
            return "Invalid version transition from \(from) to \(to)"
        case .migrationFailed(let message, let error):
            return "Migration failed: \(message)" + (error.map { " - \($0.localizedDescription)" } ?? "")
        case .transactionFailed(let error):
            return "Transaction failed: \(error.localizedDescription)"
        case .validationFailed(let reason):
            return "Validation failed: \(reason)"
        case .rollbackFailed(let error):
            return "Rollback failed: \(error.localizedDescription)"
        case .crdtConflict(let message, let error):
            return "CRDT conflict: \(message)" + (error.map { " - \($0.localizedDescription)" } ?? "")
        case .timeout(let duration):
            return "Migration timed out after \(duration) seconds"
        }
    }
    
    public var description: String {
        return errorDescription ?? "Unknown migration error"
    }
}

/// Protocol defining the contract for database migration implementations with CRDT support
public protocol DatabaseMigration {
    /// Source version number
    var fromVersion: Int { get }
    
    /// Target version number
    var toVersion: Int { get }
    
    /// Unique identifier for this migration
    var migrationId: String { get }
    
    /// Executes the migration with CRDT conflict resolution
    /// - Parameters:
    ///   - db: Database connection
    ///   - context: Migration context containing CRDT metadata
    /// - Returns: Result indicating success or specific failure
    func migrate(db: SQLite.Connection, context: MigrationContext) -> Result<Void, MigrationError>
    
    /// Validates migration prerequisites
    /// - Parameter db: Database connection
    /// - Returns: Result indicating validation success or failure
    func validate(db: SQLite.Connection) -> Result<Void, MigrationError>
    
    /// Rolls back failed migration
    /// - Parameter db: Database connection
    /// - Returns: Result indicating rollback success or failure
    func rollback(db: SQLite.Connection) -> Result<Void, MigrationError>
}

public extension DatabaseMigration {
    /// Default implementation of migrate with timeout and error handling
    func migrate(db: SQLite.Connection, context: MigrationContext) -> Result<Void, MigrationError> {
        let logger = Logger.shared
        
        // Log migration start
        logger.info("Starting migration \(migrationId) from v\(fromVersion) to v\(toVersion)")
        
        // Validate prerequisites
        switch validate(db: db) {
        case .failure(let error):
            logger.error("Migration validation failed", error: error)
            return .failure(error)
        case .success:
            break
        }
        
        // Execute migration with timeout
        let semaphore = DispatchSemaphore(value: 0)
        var migrationResult: Result<Void, MigrationError>?
        
        let queue = DispatchQueue.global(qos: .userInitiated)
        queue.async {
            do {
                try db.transaction {
                    // Apply CRDT merge strategy
                    guard self.resolveCRDTConflicts(db: db, context: context) else {
                        migrationResult = .failure(.crdtConflict("CRDT merge failed", nil))
                        return
                    }
                    
                    // Execute schema changes
                    try self.executeSchemaChanges(db: db)
                    
                    // Update version metadata
                    try self.updateVersionMetadata(db: db, context: context)
                    
                    migrationResult = .success(())
                }
            } catch {
                migrationResult = .failure(.transactionFailed(error))
            }
            semaphore.signal()
        }
        
        // Wait with timeout
        switch semaphore.wait(timeout: .now() + MIGRATION_TIMEOUT) {
        case .timedOut:
            logger.error("Migration timed out after \(MIGRATION_TIMEOUT) seconds")
            return .failure(.timeout(MIGRATION_TIMEOUT))
        case .success:
            guard let result = migrationResult else {
                return .failure(.migrationFailed("Unknown error", nil))
            }
            
            switch result {
            case .success:
                logger.info("Migration \(migrationId) completed successfully")
                return .success(())
            case .failure(let error):
                logger.error("Migration failed", error: error)
                // Attempt rollback
                switch rollback(db: db) {
                case .success:
                    logger.info("Rollback successful")
                case .failure(let rollbackError):
                    logger.error("Rollback failed", error: rollbackError)
                }
                return .failure(error)
            }
        }
    }
    
    /// Default validation implementation
    func validate(db: SQLite.Connection) -> Result<Void, MigrationError> {
        do {
            // Verify current version
            let currentVersion = try getCurrentVersion(db: db)
            guard currentVersion == fromVersion else {
                return .failure(.invalidVersion(currentVersion, toVersion))
            }
            
            // Verify schema prerequisites
            guard try validateSchemaPrerequisites(db: db) else {
                return .failure(.validationFailed("Schema prerequisites not met"))
            }
            
            return .success(())
        } catch {
            return .failure(.validationFailed(error.localizedDescription))
        }
    }
    
    /// Default rollback implementation
    func rollback(db: SQLite.Connection) -> Result<Void, MigrationError> {
        do {
            try db.transaction {
                try self.executeRollbackOperations(db: db)
            }
            return .success(())
        } catch {
            return .failure(.rollbackFailed(error))
        }
    }
    
    // MARK: - Private Helper Methods
    
    private func getCurrentVersion(db: SQLite.Connection) throws -> Int {
        let row = try db.prepare("SELECT version FROM schema_version ORDER BY timestamp DESC LIMIT 1").first
        return row?.get(0) ?? 0
    }
    
    private func validateSchemaPrerequisites(db: SQLite.Connection) throws -> Bool {
        // Implementation-specific schema validation
        return true
    }
    
    private func resolveCRDTConflicts(db: SQLite.Connection, context: MigrationContext) -> Bool {
        // Implementation-specific CRDT conflict resolution
        return true
    }
    
    private func executeSchemaChanges(db: SQLite.Connection) throws {
        // Implementation-specific schema changes
    }
    
    private func executeRollbackOperations(db: SQLite.Connection) throws {
        // Implementation-specific rollback operations
    }
    
    private func updateVersionMetadata(db: SQLite.Connection, context: MigrationContext) throws {
        let timestamp = context.timestamp.timeIntervalSince1970
        let metadata = context.metadata?.description ?? "null"
        
        try db.run("""
            INSERT INTO schema_version (version, migration_id, timestamp, vector_clock, metadata)
            VALUES (?, ?, ?, ?, ?)
        """, toVersion, migrationId, timestamp, context.vectorClock.description, metadata)
    }
}