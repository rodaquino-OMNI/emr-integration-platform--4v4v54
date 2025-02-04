// Foundation - iOS 14.0+
import Foundation
// SQLite - v0.14.1
import SQLite
// Combine - iOS 14.0+
import Combine
// CryptoKit - iOS 14.0+
import CryptoKit

/// Error types for database operations
public enum DatabaseError: LocalizedError {
    case connectionFailed(String)
    case encryptionFailed(String)
    case migrationFailed(String)
    case queryFailed(String)
    case dataCorruption(String)
    case storageLimit(String)
    case securityViolation(String)
    
    public var errorDescription: String? {
        switch self {
        case .connectionFailed(let message): return "Database connection failed: \(message)"
        case .encryptionFailed(let message): return "Encryption error: \(message)"
        case .migrationFailed(let message): return "Migration failed: \(message)"
        case .queryFailed(let message): return "Query failed: \(message)"
        case .dataCorruption(let message): return "Data corruption detected: \(message)"
        case .storageLimit(let message): return "Storage limit exceeded: \(message)"
        case .securityViolation(let message): return "Security violation: \(message)"
        }
    }
}

/// Database change event type for reactive updates
public enum DatabaseChange {
    case taskCreated(Task)
    case taskUpdated(Task)
    case taskDeleted(String)
    case migrationCompleted(Int)
    case schemaUpdated
}

/// Thread-safe offline-first database manager with CRDT support
@available(iOS 14.0, *)
public final class OfflineDatabase {
    
    // MARK: - Singleton
    
    public static let shared = OfflineDatabase()
    
    // MARK: - Constants
    
    private let DATABASE_NAME = "emr_task.db"
    private let SCHEMA_VERSION = 2
    private let DATABASE_ERROR_DOMAIN = "com.emrtask.database"
    private let MAX_RETRY_ATTEMPTS = 3
    
    // MARK: - Properties
    
    private let connection: Connection
    private let migrations: [DatabaseMigration]
    private let changePublisher = PassthroughSubject<DatabaseChange, Never>()
    private let queue: DispatchQueue
    private let encryptionKey: SymmetricKey
    private var retryCount: Int = 0
    
    // MARK: - Initialization
    
    private init() {
        // Initialize encryption key from secure storage
        guard let key = try? loadEncryptionKey() else {
            fatalError("Failed to initialize database encryption key")
        }
        self.encryptionKey = key
        
        // Initialize serial queue for thread safety
        self.queue = DispatchQueue(label: "com.emrtask.database.queue",
                                 qos: .userInitiated)
        
        // Setup encrypted database connection
        do {
            let path = try getDatabasePath()
            self.connection = try Connection(path)
            try setupEncryption(connection: connection, key: encryptionKey)
            try configureDatabaseSettings(connection: connection)
        } catch {
            Logger.shared.error("Failed to initialize database", error: error)
            fatalError("Database initialization failed: \(error.localizedDescription)")
        }
        
        // Register available migrations
        self.migrations = registerMigrations()
        
        // Run initial setup
        queue.sync {
            do {
                try runInitialSetup()
            } catch {
                Logger.shared.error("Initial setup failed", error: error)
                fatalError("Database setup failed: \(error.localizedDescription)")
            }
        }
    }
    
    // MARK: - Public Interface
    
    /// Saves tasks to local database with CRDT metadata
    public func saveTasks(_ tasks: [Task]) -> Result<Void, DatabaseError> {
        return queue.sync {
            do {
                try connection.transaction {
                    for task in tasks {
                        // Encrypt sensitive data
                        let encryptedData = try encryptSensitiveData(task: task)
                        
                        // Update CRDT metadata
                        let vectorClock = updateVectorClock(for: task)
                        
                        // Save to database
                        try saveTask(encryptedData, vectorClock: vectorClock)
                        
                        // Create audit log
                        try createAuditLog(action: "save_task",
                                         taskId: task.id,
                                         metadata: ["vector_clock": vectorClock])
                        
                        // Publish change event
                        changePublisher.send(.taskCreated(task))
                    }
                }
                return .success(())
            } catch {
                Logger.shared.error("Failed to save tasks", error: error)
                return .failure(.queryFailed(error.localizedDescription))
            }
        }
    }
    
    /// Retrieves tasks with optional filtering
    public func getTasks(filter: TaskFilter? = nil) -> Result<[Task], DatabaseError> {
        return queue.sync {
            do {
                // Build query with filters
                let query = buildTaskQuery(filter: filter)
                
                // Execute with timeout
                let tasks = try withTimeout(seconds: 30) {
                    try self.connection.prepare(query).map { row in
                        try self.decryptAndCreateTask(from: row)
                    }
                }
                
                // Log access for audit
                try createAuditLog(action: "get_tasks",
                                 metadata: ["filter": String(describing: filter)])
                
                return .success(Array(tasks))
            } catch {
                Logger.shared.error("Failed to retrieve tasks", error: error)
                return .failure(.queryFailed(error.localizedDescription))
            }
        }
    }
    
    /// Runs pending database migrations
    public func runMigrations() -> Result<Void, DatabaseError> {
        return queue.sync {
            do {
                let currentVersion = try getCurrentSchemaVersion()
                guard currentVersion < SCHEMA_VERSION else { return .success(()) }
                
                // Create backup before migration
                try createDatabaseBackup()
                
                // Sort and execute pending migrations
                let pendingMigrations = migrations.filter { $0.fromVersion > currentVersion }
                                                .sorted { $0.fromVersion < $1.fromVersion }
                
                for migration in pendingMigrations {
                    let context = MigrationContext(
                        vectorClock: [:],
                        timestamp: Date(),
                        metadata: ["version": migration.toVersion]
                    )
                    
                    switch migration.migrate(db: connection, context: context) {
                    case .success:
                        changePublisher.send(.migrationCompleted(migration.toVersion))
                    case .failure(let error):
                        return .failure(.migrationFailed(error.localizedDescription))
                    }
                }
                
                return .success(())
            } catch {
                Logger.shared.error("Migration failed", error: error)
                return .failure(.migrationFailed(error.localizedDescription))
            }
        }
    }
    
    // MARK: - Private Helpers
    
    private func loadEncryptionKey() throws -> SymmetricKey {
        // Implementation of secure key loading from Keychain
        fatalError("Implementation required")
    }
    
    private func setupEncryption(connection: Connection, key: SymmetricKey) throws {
        // Implementation of SQLite encryption setup
        fatalError("Implementation required")
    }
    
    private func configureDatabaseSettings(connection: Connection) throws {
        try connection.execute("PRAGMA journal_mode = WAL")
        try connection.execute("PRAGMA synchronous = NORMAL")
        try connection.execute("PRAGMA foreign_keys = ON")
        try connection.execute("PRAGMA auto_vacuum = INCREMENTAL")
    }
    
    private func runInitialSetup() throws {
        try createSchemaVersionTable()
        try createTasksTable()
        try createAuditLogTable()
        try createIndices()
    }
    
    private func registerMigrations() -> [DatabaseMigration] {
        // Register available migrations
        return []
    }
    
    private func getCurrentSchemaVersion() throws -> Int {
        let row = try connection.prepare("SELECT version FROM schema_version ORDER BY timestamp DESC LIMIT 1").first
        return row?.get(0) ?? 0
    }
    
    private func createDatabaseBackup() throws {
        // Implementation of database backup
        fatalError("Implementation required")
    }
    
    private func encryptSensitiveData(task: Task) throws -> Data {
        // Implementation of field-level encryption
        fatalError("Implementation required")
    }
    
    private func updateVectorClock(for task: Task) -> [String: Int] {
        // Implementation of CRDT vector clock update
        fatalError("Implementation required")
    }
    
    private func createAuditLog(action: String, taskId: String? = nil, metadata: [String: Any]? = nil) throws {
        let timestamp = Date().timeIntervalSince1970
        let query = """
            INSERT INTO audit_log (timestamp, action, task_id, metadata)
            VALUES (?, ?, ?, ?)
        """
        try connection.run(query, timestamp, action, taskId, metadata?.description)
    }
}

// MARK: - Schema Creation Extensions

private extension OfflineDatabase {
    func createSchemaVersionTable() throws {
        try connection.execute("""
            CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER NOT NULL,
                migration_id TEXT NOT NULL,
                timestamp REAL NOT NULL,
                vector_clock TEXT,
                metadata TEXT
            )
        """)
    }
    
    func createTasksTable() throws {
        try connection.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL,
                due_date REAL,
                assigned_to TEXT,
                patient_id TEXT,
                emr_data BLOB,
                vector_clock TEXT NOT NULL,
                encrypted_data BLOB,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            )
        """)
    }
    
    func createAuditLogTable() throws {
        try connection.execute("""
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp REAL NOT NULL,
                action TEXT NOT NULL,
                task_id TEXT,
                metadata TEXT,
                FOREIGN KEY(task_id) REFERENCES tasks(id)
            )
        """)
    }
    
    func createIndices() throws {
        try connection.execute("CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)")
        try connection.execute("CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date)")
        try connection.execute("CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp)")
    }
}