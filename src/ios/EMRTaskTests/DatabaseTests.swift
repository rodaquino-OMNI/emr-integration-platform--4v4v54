// XCTest framework v14.0+
// Combine framework v14.0+
// EMRTask module v14.0+

import XCTest
import Combine
@testable import EMRTask

@available(iOS 14.0, *)
class DatabaseTests: XCTestCase {
    
    private var database: OfflineDatabase!
    private var cancellables: Set<AnyCancellable>!
    private var testQueue: DispatchQueue!
    
    override func setUp() {
        super.setUp()
        
        // Initialize test environment with unique database identifier
        let testIdentifier = UUID().uuidString
        let testConfig = DatabaseConfiguration(
            identifier: testIdentifier,
            encryptionKey: Data.random(count: 32), // AES-256 key
            schemaVersion: 1,
            maxConnectionPool: 5
        )
        
        database = try! OfflineDatabase(configuration: testConfig)
        cancellables = Set<AnyCancellable>()
        testQueue = DispatchQueue(label: "com.emrtask.tests.\(testIdentifier)")
    }
    
    override func tearDown() {
        // Clean up test resources
        cancellables.forEach { $0.cancel() }
        cancellables = nil
        
        // Delete test database file
        try? FileManager.default.removeItem(at: database.fileURL)
        database = nil
        testQueue = nil
        
        super.tearDown()
    }
    
    func testDatabaseInitialization() throws {
        // Test database creation
        XCTAssertNotNil(database, "Database should be initialized")
        XCTAssertTrue(FileManager.default.fileExists(atPath: database.fileURL.path))
        
        // Verify schema version
        let version = try database.getCurrentSchemaVersion()
        XCTAssertEqual(version, 1, "Initial schema version should be 1")
        
        // Verify encryption
        let encryptionEnabled = try database.isEncryptionEnabled()
        XCTAssertTrue(encryptionEnabled, "Database encryption should be enabled")
        
        // Test connection pool
        let connections = try database.getActiveConnections()
        XCTAssertLessThanOrEqual(connections.count, 5, "Connection pool should be limited")
    }
    
    func testTaskSaveAndRetrieval() throws {
        // Create test task with CRDT metadata
        let taskId = UUID()
        let vectorClock = VectorClock(counter: 1, nodeId: "test-device")
        let task = Task(
            id: taskId,
            title: "Test Task",
            status: .pending,
            vectorClock: vectorClock,
            createdAt: Date(),
            updatedAt: Date()
        )
        
        // Save task
        let saveExpectation = expectation(description: "Save task")
        database.save(task)
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        XCTFail("Task save failed: \(error)")
                    }
                },
                receiveValue: { _ in
                    saveExpectation.fulfill()
                }
            )
            .store(in: &cancellables)
        
        wait(for: [saveExpectation], timeout: 5.0)
        
        // Retrieve and verify
        let retrieveExpectation = expectation(description: "Retrieve task")
        database.getTask(id: taskId)
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        XCTFail("Task retrieval failed: \(error)")
                    }
                },
                receiveValue: { retrievedTask in
                    XCTAssertEqual(retrievedTask.id, task.id)
                    XCTAssertEqual(retrievedTask.vectorClock.counter, vectorClock.counter)
                    retrieveExpectation.fulfill()
                }
            )
            .store(in: &cancellables)
        
        wait(for: [retrieveExpectation], timeout: 5.0)
    }
    
    func testDatabaseMigration() throws {
        // Create v1 schema
        let v1Schema = """
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            status TEXT NOT NULL,
            vector_clock TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        """
        try database.executeSQL(v1Schema)
        
        // Insert test data
        let testTask = """
        INSERT INTO tasks (id, title, status, vector_clock, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?);
        """
        try database.executeSQL(testTask, parameters: [
            UUID().uuidString,
            "Migration Test",
            "pending",
            "{\"counter\":1,\"nodeId\":\"test\"}",
            Date().timeIntervalSince1970,
            Date().timeIntervalSince1970
        ])
        
        // Perform migration to v2
        let migrationExpectation = expectation(description: "Migration")
        database.migrate(toVersion: 2)
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        XCTFail("Migration failed: \(error)")
                    }
                },
                receiveValue: { _ in
                    migrationExpectation.fulfill()
                }
            )
            .store(in: &cancellables)
        
        wait(for: [migrationExpectation], timeout: 5.0)
        
        // Verify migration
        let version = try database.getCurrentSchemaVersion()
        XCTAssertEqual(version, 2, "Schema should be upgraded to version 2")
    }
    
    func testDatabaseEncryption() throws {
        // Test data
        let sensitiveData = "PHI Test Data"
        let taskId = UUID()
        
        // Save encrypted data
        let saveExpectation = expectation(description: "Save encrypted")
        database.saveEncrypted(data: sensitiveData, forTask: taskId)
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        XCTFail("Encryption save failed: \(error)")
                    }
                },
                receiveValue: { _ in
                    saveExpectation.fulfill()
                }
            )
            .store(in: &cancellables)
        
        wait(for: [saveExpectation], timeout: 5.0)
        
        // Verify encryption
        let fileData = try Data(contentsOf: database.fileURL)
        XCTAssertFalse(fileData.contains(sensitiveData.data(using: .utf8)!))
        
        // Test key rotation
        let rotationExpectation = expectation(description: "Key rotation")
        let newKey = Data.random(count: 32)
        database.rotateEncryptionKey(to: newKey)
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        XCTFail("Key rotation failed: \(error)")
                    }
                },
                receiveValue: { _ in
                    rotationExpectation.fulfill()
                }
            )
            .store(in: &cancellables)
        
        wait(for: [rotationExpectation], timeout: 5.0)
    }
    
    func testChangeNotifications() throws {
        let notificationExpectation = expectation(description: "Change notification")
        notificationExpectation.expectedFulfillmentCount = 3 // Insert, Update, Delete
        
        // Subscribe to changes
        database.changePublisher
            .sink { change in
                switch change.type {
                case .insert:
                    XCTAssertNotNil(change.newValue)
                    XCTAssertNil(change.oldValue)
                case .update:
                    XCTAssertNotNil(change.newValue)
                    XCTAssertNotNil(change.oldValue)
                case .delete:
                    XCTAssertNil(change.newValue)
                    XCTAssertNotNil(change.oldValue)
                }
                notificationExpectation.fulfill()
            }
            .store(in: &cancellables)
        
        // Perform database operations
        let taskId = UUID()
        let task = Task(
            id: taskId,
            title: "Notification Test",
            status: .pending,
            vectorClock: VectorClock(counter: 1, nodeId: "test"),
            createdAt: Date(),
            updatedAt: Date()
        )
        
        // Test insert
        try await database.save(task).value
        
        // Test update
        var updatedTask = task
        updatedTask.status = .inProgress
        try await database.save(updatedTask).value
        
        // Test delete
        try await database.delete(taskId).value
        
        wait(for: [notificationExpectation], timeout: 5.0)
    }
}