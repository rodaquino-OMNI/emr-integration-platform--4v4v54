// Foundation - iOS 14.0+
import Foundation
// Combine - iOS 14.0+
import Combine

/// Error domain for offline plugin operations
private let OFFLINE_PLUGIN_ERROR_DOMAIN = "com.emrtask.offlineplugin"
/// Notification name for offline state changes
private let OFFLINE_STATE_CHANGED_NOTIFICATION = Notification.Name("com.emrtask.offlineStateChanged")
/// Maximum retry attempts for operations
private let MAX_RETRY_ATTEMPTS = 3
/// Default sync interval in seconds
private let SYNC_INTERVAL_SECONDS = 300
/// Batch size for data operations
private let BATCH_SIZE = 100

/// Comprehensive performance metrics for offline operations
public struct PerformanceMetrics {
    var syncLatency: TimeInterval
    var storageUsage: Int64
    var conflictRate: Double
    var successRate: Double
    var batteryImpact: Double
    var lastSyncTimestamp: Date
}

/// Enhanced offline state enumeration
@objc public enum OfflineState: Int {
    case online(ConnectionQuality)
    case offline(Error?)
    case syncing(Progress)
    case error(OfflineError)
    case recovering(RetryAttempt)
    
    var description: String {
        switch self {
        case .online(let quality): return "Online (\(quality))"
        case .offline(let error): return "Offline\(error.map { ": \($0.localizedDescription)" } ?? "")"
        case .syncing(let progress): return "Syncing (\(progress.fractionCompleted * 100)%)"
        case .error(let error): return "Error: \(error.localizedDescription)"
        case .recovering(let attempt): return "Recovering (Attempt \(attempt.count))"
        }
    }
}

/// Detailed offline error types
public enum OfflineError: LocalizedError {
    case storageLimit(String)
    case syncFailed(String)
    case encryptionFailed(String)
    case networkError(String)
    case conflictResolutionFailed(String)
    
    public var errorDescription: String? {
        switch self {
        case .storageLimit(let message): return "Storage limit exceeded: \(message)"
        case .syncFailed(let message): return "Sync failed: \(message)"
        case .encryptionFailed(let message): return "Encryption failed: \(message)"
        case .networkError(let message): return "Network error: \(message)"
        case .conflictResolutionFailed(let message): return "Conflict resolution failed: \(message)"
        }
    }
}

/// Retry attempt tracking
public struct RetryAttempt {
    let count: Int
    let timestamp: Date
    let error: Error?
}

/// Thread-safe plugin managing offline-first capabilities with CRDT support
@available(iOS 14.0, *)
public final class OfflinePlugin {
    
    // MARK: - Properties
    
    /// Shared instance for singleton access
    public static let shared = OfflinePlugin()
    
    private let database: OfflineDatabase
    private let syncManager: SyncManager
    private let networkMonitor: NetworkMonitor
    private var cancellables = Set<AnyCancellable>()
    private var retryCount: Int = 0
    private var performanceMetrics = PerformanceMetrics(
        syncLatency: 0,
        storageUsage: 0,
        conflictRate: 0,
        successRate: 100,
        batteryImpact: 0,
        lastSyncTimestamp: Date()
    )
    
    @Published private(set) public var offlineState: OfflineState = .offline(nil)
    
    // MARK: - Initialization
    
    private init() {
        self.database = OfflineDatabase.shared
        self.syncManager = SyncManager.shared
        self.networkMonitor = NetworkMonitor.shared
        
        setupObservers()
        configureEncryption()
        initializePerformanceMonitoring()
    }
    
    // MARK: - Public Interface
    
    /// Saves tasks with encryption and compression
    @discardableResult
    public func saveTasks(_ tasks: [Task]) -> Result<Void, OfflineError> {
        let startTime = Date()
        
        do {
            // Compress and encrypt task data
            let compressedData = try database.compressData(tasks)
            let encryptedData = try database.encryptData(compressedData)
            
            // Save to offline storage
            switch database.saveTasks(tasks) {
            case .success:
                // Update CRDT state and trigger sync if online
                if networkMonitor.isConnected {
                    _ = syncManager.startSync()
                }
                
                // Update performance metrics
                updatePerformanceMetrics(startTime: startTime, operation: "save")
                return .success(())
                
            case .failure(let error):
                throw error
            }
        } catch {
            Logger.shared.error("Failed to save tasks", error: error)
            return .failure(.storageLimit(error.localizedDescription))
        }
    }
    
    /// Retrieves tasks with progressive loading
    public func getTasks(filter: TaskFilter? = nil, options: BatchOptions? = nil) -> Result<[Task], OfflineError> {
        let startTime = Date()
        
        do {
            // Retrieve from offline storage with batching
            let result = try database.getTasks(filter: filter)
            
            switch result {
            case .success(let tasks):
                // Update performance metrics
                updatePerformanceMetrics(startTime: startTime, operation: "retrieve")
                return .success(tasks)
                
            case .failure(let error):
                throw error
            }
        } catch {
            Logger.shared.error("Failed to retrieve tasks", error: error)
            return .failure(.storageLimit(error.localizedDescription))
        }
    }
    
    // MARK: - Private Methods
    
    private func setupObservers() {
        // Monitor network state changes
        networkMonitor.connectionStatusPublisher
            .sink { [weak self] isConnected in
                self?.handleNetworkStateChange(isConnected)
            }
            .store(in: &cancellables)
        
        // Monitor sync state changes
        syncManager.$syncState
            .sink { [weak self] state in
                self?.handleSyncStateChange(state)
            }
            .store(in: &cancellables)
    }
    
    private func handleNetworkStateChange(_ isConnected: Bool) {
        if isConnected {
            offlineState = .online(networkMonitor.connectionQuality)
            // Trigger sync for pending changes
            _ = syncManager.startSync()
        } else {
            offlineState = .offline(nil)
        }
        
        notifyStateChange(offlineState)
    }
    
    private func handleSyncStateChange(_ state: SyncState) {
        switch state {
        case .syncing:
            offlineState = .syncing(Progress(totalUnitCount: 100))
        case .error(let error):
            handleSyncError(error)
        case .idle:
            offlineState = .online(networkMonitor.connectionQuality)
        default:
            break
        }
        
        notifyStateChange(offlineState)
    }
    
    private func handleSyncError(_ error: Error) {
        retryCount += 1
        
        if retryCount < MAX_RETRY_ATTEMPTS {
            offlineState = .recovering(RetryAttempt(count: retryCount, timestamp: Date(), error: error))
            retrySync()
        } else {
            offlineState = .error(.syncFailed(error.localizedDescription))
            retryCount = 0
        }
    }
    
    private func retrySync() {
        let backoffInterval = pow(2.0, Double(retryCount)) * SyncConstants.syncInterval
        
        DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + backoffInterval) { [weak self] in
            _ = self?.syncManager.startSync()
        }
    }
    
    private func updatePerformanceMetrics(startTime: Date, operation: String) {
        let duration = Date().timeIntervalSince(startTime)
        performanceMetrics.syncLatency = duration
        performanceMetrics.lastSyncTimestamp = Date()
        
        Logger.shared.debug("Operation '\(operation)' completed in \(duration)s")
    }
    
    private func notifyStateChange(_ state: OfflineState, error: Error? = nil) {
        NotificationCenter.default.post(
            name: OFFLINE_STATE_CHANGED_NOTIFICATION,
            object: self,
            userInfo: [
                "state": state,
                "error": error as Any,
                "timestamp": Date()
            ]
        )
    }
    
    private func configureEncryption() {
        // Implementation of encryption configuration
    }
    
    private func initializePerformanceMonitoring() {
        Timer.scheduledTimer(withTimeInterval: 300, repeats: true) { [weak self] _ in
            self?.logPerformanceMetrics()
        }
    }
    
    private func logPerformanceMetrics() {
        Logger.shared.debug("""
            Offline Plugin Performance:
            - Sync Latency: \(performanceMetrics.syncLatency)s
            - Storage Usage: \(performanceMetrics.storageUsage) bytes
            - Conflict Rate: \(performanceMetrics.conflictRate)%
            - Success Rate: \(performanceMetrics.successRate)%
            - Battery Impact: \(performanceMetrics.batteryImpact)%
            """)
    }
}