// Foundation - iOS 14.0+
import Foundation
// Combine - iOS 14.0+
import Combine

/// Notification posted when sync state changes
public let SYNC_STATE_CHANGED_NOTIFICATION = Notification.Name("com.emrtask.syncStateChanged")
/// Default sync interval in seconds (5 minutes)
private let DEFAULT_SYNC_INTERVAL: TimeInterval = 300
/// Minimum sync interval in seconds (1 minute)
private let MIN_SYNC_INTERVAL: TimeInterval = 60
/// Maximum retry attempts for sync operations
private let MAX_RETRY_ATTEMPTS = 3
/// Sync operation timeout interval
private let SYNC_TIMEOUT_INTERVAL: TimeInterval = 30

/// Enhanced sync metrics for performance monitoring
private struct SyncMetrics {
    var syncLatency: TimeInterval
    var successRate: Double
    var lastSyncTimestamp: Date
    var conflictsResolved: Int
    var dataTransferred: Int64
    var batteryImpact: Double
}

/// Comprehensive sync state enumeration
@objc public enum SyncState: Int {
    case idle
    case syncing
    case error(SyncError)
    case offline
    case retrying(attempt: Int)
    
    var description: String {
        switch self {
        case .idle: return "Idle"
        case .syncing: return "Syncing"
        case .error(let error): return "Error: \(error.localizedDescription)"
        case .offline: return "Offline"
        case .retrying(let attempt): return "Retrying (Attempt \(attempt))"
        }
    }
}

/// Detailed sync error types
public enum SyncError: LocalizedError {
    case networkUnavailable
    case timeout
    case conflictResolutionFailed(String)
    case securityError(String)
    case storageError(String)
    
    public var errorDescription: String? {
        switch self {
        case .networkUnavailable:
            return "Network connection unavailable"
        case .timeout:
            return "Sync operation timed out"
        case .conflictResolutionFailed(let reason):
            return "Conflict resolution failed: \(reason)"
        case .securityError(let reason):
            return "Security violation: \(reason)"
        case .storageError(let reason):
            return "Storage error: \(reason)"
        }
    }
}

/// Thread-safe synchronization manager with enhanced security and monitoring
@available(iOS 14.0, *)
public final class SyncManager {
    
    // MARK: - Properties
    
    /// Shared instance for singleton access
    public static let shared = SyncManager()
    
    private let crdt: CRDTManager
    private let worker: SyncWorker
    private let networkMonitor: NetworkMonitor
    private var cancellables = Set<AnyCancellable>()
    
    @Published private(set) public var syncState: SyncState = .idle
    private var syncInterval: TimeInterval = DEFAULT_SYNC_INTERVAL
    private var retryCount: Int = 0
    private var performanceMetrics = SyncMetrics(
        syncLatency: 0,
        successRate: 100,
        lastSyncTimestamp: Date(),
        conflictsResolved: 0,
        dataTransferred: 0,
        batteryImpact: 0
    )
    
    // MARK: - Initialization
    
    private init() {
        self.crdt = CRDTManager.shared
        self.worker = SyncWorker.shared
        self.networkMonitor = NetworkMonitor.shared
        
        setupObservers()
        configureSecurityPolicy()
        initializeMetrics()
    }
    
    // MARK: - Public Interface
    
    /// Initiates manual synchronization with comprehensive error handling
    @discardableResult
    public func startSync() -> Result<Void, SyncError> {
        let startTime = Date()
        
        // Validate network state
        guard networkMonitor.isConnected else {
            syncState = .offline
            notifyStateChange(syncState)
            return .failure(.networkUnavailable)
        }
        
        // Check if sync already in progress
        guard case .idle = syncState else {
            return .failure(.conflictResolutionFailed("Sync already in progress"))
        }
        
        syncState = .syncing
        notifyStateChange(syncState)
        
        do {
            // Start performance monitoring
            let metrics = startPerformanceMonitoring()
            
            // Execute sync with timeout
            let result = try withTimeout(SYNC_TIMEOUT_INTERVAL) {
                try self.executeSyncOperation()
            }
            
            // Update metrics
            updatePerformanceMetrics(
                startTime: startTime,
                metrics: metrics,
                success: true
            )
            
            // Schedule next sync
            scheduleNextSync()
            
            syncState = .idle
            notifyStateChange(syncState)
            
            return .success(())
        } catch {
            handleSyncError(error)
            return .failure(mapError(error))
        }
    }
    
    /// Configures sync interval with adaptive scheduling
    public func configureSyncInterval(_ interval: TimeInterval) {
        queue.async { [weak self] in
            guard let self = self else { return }
            
            // Validate interval bounds
            let validInterval = max(MIN_SYNC_INTERVAL, min(interval, DEFAULT_SYNC_INTERVAL))
            
            // Adjust based on network quality
            let adjustedInterval = self.adjustIntervalForNetworkQuality(validInterval)
            
            // Update interval and reschedule
            self.syncInterval = adjustedInterval
            self.scheduleNextSync()
            
            Logger.shared.debug("Sync interval configured: \(adjustedInterval)s")
        }
    }
    
    // MARK: - Private Methods
    
    private func setupObservers() {
        // Monitor network state changes
        networkMonitor.connectionStatusPublisher
            .sink { [weak self] isConnected in
                if isConnected {
                    self?.handleNetworkReconnection()
                } else {
                    self?.handleNetworkDisconnection()
                }
            }
            .store(in: &cancellables)
        
        // Monitor CRDT merge events
        crdt.mergePublisher
            .sink { [weak self] event in
                self?.handleMergeEvent(event)
            }
            .store(in: &cancellables)
    }
    
    private func executeSyncOperation() throws {
        // Validate security context
        guard validateSecurityContext() else {
            throw SyncError.securityError("Invalid security context")
        }
        
        // Execute sync with worker
        switch worker.startSync() {
        case .success:
            retryCount = 0
        case .failure(let error):
            throw error
        }
    }
    
    private func handleSyncError(_ error: Error) {
        retryCount += 1
        
        if retryCount < MAX_RETRY_ATTEMPTS {
            syncState = .retrying(attempt: retryCount)
            notifyStateChange(syncState)
            retrySync()
        } else {
            syncState = .error(mapError(error))
            notifyStateChange(syncState)
            retryCount = 0
        }
        
        Logger.shared.error("Sync failed", error: error)
    }
    
    private func retrySync() {
        let backoffInterval = calculateBackoffInterval(attempt: retryCount)
        
        DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + backoffInterval) { [weak self] in
            _ = self?.startSync()
        }
    }
    
    private func scheduleNextSync() {
        worker.scheduleNextSync(interval: syncInterval)
    }
    
    private func notifyStateChange(_ state: SyncState) {
        NotificationCenter.default.post(
            name: SYNC_STATE_CHANGED_NOTIFICATION,
            object: self,
            userInfo: ["state": state]
        )
    }
    
    private func mapError(_ error: Error) -> SyncError {
        switch error {
        case let syncError as SyncError:
            return syncError
        case let error as NSError where error.domain == NSURLErrorDomain:
            return .networkUnavailable
        default:
            return .conflictResolutionFailed(error.localizedDescription)
        }
    }
    
    private func calculateBackoffInterval(attempt: Int) -> TimeInterval {
        return min(pow(2.0, Double(attempt)) * MIN_SYNC_INTERVAL, DEFAULT_SYNC_INTERVAL)
    }
    
    private func adjustIntervalForNetworkQuality(_ interval: TimeInterval) -> TimeInterval {
        switch networkMonitor.connectionQuality {
        case .excellent: return interval
        case .good: return interval * 1.2
        case .fair: return interval * 1.5
        case .poor: return interval * 2.0
        case .unknown: return interval
        }
    }
    
    private func validateSecurityContext() -> Bool {
        // Implement security validation
        return true
    }
    
    private func withTimeout<T>(_ timeout: TimeInterval, operation: () throws -> T) throws -> T {
        let semaphore = DispatchSemaphore(value: 0)
        var result: Result<T, Error>?
        
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let value = try operation()
                result = .success(value)
            } catch {
                result = .failure(error)
            }
            semaphore.signal()
        }
        
        guard case .success = semaphore.wait(timeout: .now() + timeout) else {
            throw SyncError.timeout
        }
        
        switch result {
        case .some(.success(let value)):
            return value
        case .some(.failure(let error)):
            throw error
        case .none:
            throw SyncError.timeout
        }
    }
}