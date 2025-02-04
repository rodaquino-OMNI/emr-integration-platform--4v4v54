// XCTest - iOS 14.0+
import XCTest
// Combine - iOS 14.0+
import Combine
@testable import EMRTask

@available(iOS 14.0, *)
final class OfflinePluginTests: XCTestCase {
    
    // MARK: - Properties
    
    private var plugin: OfflinePlugin!
    private var cancellables: Set<AnyCancellable>!
    private var networkMonitor: NetworkMonitor!
    private var testExpectation: XCTestExpectation!
    
    // MARK: - Setup & Teardown
    
    override func setUpWithError() throws {
        try super.setUpWithError()
        
        // Initialize test components
        plugin = OfflinePlugin.shared
        cancellables = Set<AnyCancellable>()
        networkMonitor = NetworkMonitor.shared
        
        // Clear any existing data
        try OfflineDatabase.shared.clearAllData()
        
        // Reset network monitor state
        networkMonitor.startMonitoring()
    }
    
    override func tearDownWithError() throws {
        // Cancel all publishers
        cancellables.forEach { $0.cancel() }
        cancellables = nil
        
        // Clear test data
        try OfflineDatabase.shared.clearAllData()
        
        // Reset network monitor
        networkMonitor.stopMonitoring()
        
        plugin = nil
        testExpectation = nil
        
        try super.tearDownWithError()
    }
    
    // MARK: - Test Cases
    
    func testInitialOfflineState() throws {
        // Given
        let expectation = expectation(description: "Initial state check")
        var receivedState: OfflineState?
        
        // When
        plugin.$offlineState
            .sink { state in
                receivedState = state
                expectation.fulfill()
            }
            .store(in: &cancellables)
        
        // Then
        waitForExpectations(timeout: TEST_TIMEOUT)
        XCTAssertNotNil(receivedState, "Should receive initial state")
        
        switch receivedState {
        case .online(let quality):
            XCTAssertEqual(networkMonitor.isConnected, true)
            XCTAssertEqual(quality, networkMonitor.connectionQuality)
        case .offline:
            XCTAssertEqual(networkMonitor.isConnected, false)
        default:
            XCTFail("Unexpected initial state: \(String(describing: receivedState))")
        }
    }
    
    func testSaveTasksOffline() throws {
        // Given
        let expectation = expectation(description: "Save tasks offline")
        let mockTasks = generateMockTasks(count: MOCK_TASK_COUNT)
        
        // Force offline mode
        networkMonitor.simulateNetworkChange(isConnected: false)
        
        // When
        let result = plugin.saveTasks(mockTasks)
        
        // Then
        switch result {
        case .success:
            // Verify tasks were saved locally
            mockTasks.forEach { task in
                let exists = try? OfflineDatabase.shared.verifyTaskExists(task.id)
                XCTAssertTrue(exists == true, "Task \(task.id) should be saved locally")
            }
            
            // Verify sync was not triggered
            XCTAssertEqual(plugin.offlineState, .offline(nil))
            
            expectation.fulfill()
        case .failure(let error):
            XCTFail("Failed to save tasks offline: \(error.localizedDescription)")
        }
        
        waitForExpectations(timeout: TEST_TIMEOUT)
    }
    
    func testSyncPerformance() throws {
        // Given
        let expectation = expectation(description: "Sync performance test")
        let mockTasks = generateMockTasks(count: MOCK_TASK_COUNT)
        var syncDurations: [TimeInterval] = []
        
        // Force offline and save tasks
        networkMonitor.simulateNetworkChange(isConnected: false)
        _ = plugin.saveTasks(mockTasks)
        
        // Measure sync performance
        measure {
            let startTime = Date()
            
            // Simulate network restoration
            networkMonitor.simulateNetworkChange(isConnected: true)
            
            // Wait for sync completion
            plugin.$offlineState
                .filter { state in
                    if case .online = state {
                        let duration = Date().timeIntervalSince(startTime)
                        syncDurations.append(duration)
                        return true
                    }
                    return false
                }
                .first()
                .sink { _ in
                    expectation.fulfill()
                }
                .store(in: &cancellables)
        }
        
        waitForExpectations(timeout: TEST_TIMEOUT)
        
        // Verify 95th percentile sync performance
        let sortedDurations = syncDurations.sorted()
        let percentileIndex = Int(Double(sortedDurations.count) * 0.95)
        let percentileValue = sortedDurations[percentileIndex]
        
        XCTAssertLessThanOrEqual(percentileValue, SYNC_PERFORMANCE_THRESHOLD,
                                "95th percentile sync duration should be under 500ms")
    }
    
    // MARK: - Helper Methods
    
    private func generateMockTasks(count: Int) -> [Task] {
        return (0..<count).map { index in
            Task(
                id: UUID().uuidString,
                title: "Test Task \(index)",
                description: "Test Description \(index)",
                status: .pending,
                dueDate: Date().addingTimeInterval(Double(index) * 3600),
                assignedTo: "test_user",
                patientId: "patient_\(index)",
                emrData: ["test": "data"],
                vectorClock: ["node1": index],
                createdAt: Date(),
                updatedAt: Date()
            )
        }
    }
}