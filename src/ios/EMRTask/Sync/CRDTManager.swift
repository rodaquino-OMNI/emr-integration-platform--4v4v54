// Foundation - iOS 14.0+
import Foundation
// Combine - iOS 14.0+
import Combine

/// Performance metrics for CRDT operations
private struct PerformanceMetrics {
    var mergeLatency: TimeInterval
    var conflictRate: Double
    var syncAttempts: Int
    var lastSyncTimestamp: Date
}

/// Event types for CRDT merge operations
public enum MergeEvent {
    case started(Date)
    case completed(TimeInterval)
    case failed(Error)
    case conflictResolved(String)
}

/// Error types for CRDT operations
public enum CRDTError: LocalizedError {
    case mergeTimeout
    case vectorClockOverflow
    case invalidState(String)
    case concurrencyViolation(String)
    
    public var errorDescription: String? {
        switch self {
        case .mergeTimeout:
            return "CRDT merge operation exceeded timeout threshold"
        case .vectorClockOverflow:
            return "Vector clock exceeded maximum size threshold"
        case .invalidState(let message):
            return "Invalid CRDT state: \(message)"
        case .concurrencyViolation(let message):
            return "Concurrency violation: \(message)"
        }
    }
}

/// Thread-safe CRDT manager implementing optimized conflict resolution
@available(iOS 14.0, *)
public final class CRDTManager {
    
    // MARK: - Constants
    
    private let VECTOR_CLOCK_KEY = "vector_clock"
    private let MAX_MERGE_ATTEMPTS = 3
    private let MERGE_TIMEOUT: TimeInterval = 0.5
    private let BATCH_SIZE = 100
    private let VECTOR_CLOCK_PRUNE_THRESHOLD = 1000
    
    // MARK: - Properties
    
    public static let shared = CRDTManager()
    
    private let queue: DispatchQueue
    private let mergePublisher = PassthroughSubject<MergeEvent, Never>()
    private let nodeId: String
    private var vectorClock: [String: Int]
    private var performanceMetrics: PerformanceMetrics
    private let retryQueue: OperationQueue
    
    // MARK: - Initialization
    
    private init() {
        self.nodeId = UUID().uuidString
        self.vectorClock = [nodeId: 0]
        self.queue = DispatchQueue(label: "com.emrtask.crdt.queue",
                                 qos: .userInitiated)
        self.performanceMetrics = PerformanceMetrics(
            mergeLatency: 0,
            conflictRate: 0,
            syncAttempts: 0,
            lastSyncTimestamp: Date()
        )
        
        self.retryQueue = OperationQueue()
        retryQueue.maxConcurrentOperationCount = 1
        retryQueue.qualityOfService = .userInitiated
        
        setupPerformanceMonitoring()
    }
    
    // MARK: - Public Interface
    
    /// Applies a local change with performance tracking
    @discardableResult
    public func applyChange(_ change: TaskChange) -> Result<Task, Error> {
        let startTime = Date()
        
        return queue.sync {
            do {
                // Increment local vector clock
                vectorClock[nodeId] = (vectorClock[nodeId] ?? 0) + 1
                
                // Apply change with validation
                let updatedTask = try validateAndApplyChange(change)
                
                // Save to offline storage
                try OfflineDatabase.shared.saveTasks([updatedTask])
                
                // Track performance
                let duration = Date().timeIntervalSince(startTime)
                Logger.shared.performance("CRDT change applied in \(duration)s")
                
                // Publish event
                mergePublisher.send(.completed(duration))
                
                return .success(updatedTask)
            } catch {
                Logger.shared.error("Failed to apply CRDT change", error: error)
                mergePublisher.send(.failed(error))
                return .failure(error)
            }
        }
    }
    
    /// Merges remote and local states with optimized conflict resolution
    public func mergeStates(_ remoteTasks: [Task], _ localTasks: [Task]) -> Result<[Task], Error> {
        let startTime = Date()
        mergePublisher.send(.started(startTime))
        
        return queue.sync {
            do {
                var mergedTasks: [Task] = []
                let batches = stride(from: 0, to: remoteTasks.count, by: BATCH_SIZE)
                
                for batchStart in batches {
                    let batchEnd = min(batchStart + BATCH_SIZE, remoteTasks.count)
                    let remoteBatch = Array(remoteTasks[batchStart..<batchEnd])
                    
                    // Process batch with timeout
                    let result = try withTimeout(MERGE_TIMEOUT) {
                        try self.processBatch(remoteBatch, localTasks)
                    }
                    
                    mergedTasks.append(contentsOf: result)
                }
                
                // Prune vector clock if needed
                pruneVectorClockIfNeeded()
                
                // Update performance metrics
                let duration = Date().timeIntervalSince(startTime)
                updatePerformanceMetrics(duration: duration)
                
                // Save merged state
                try OfflineDatabase.shared.saveTasks(mergedTasks)
                
                mergePublisher.send(.completed(duration))
                return .success(mergedTasks)
            } catch {
                Logger.shared.error("CRDT merge failed", error: error)
                mergePublisher.send(.failed(error))
                return .failure(error)
            }
        }
    }
    
    // MARK: - Private Methods
    
    private func validateAndApplyChange(_ change: TaskChange) throws -> Task {
        guard let task = change.task else {
            throw CRDTError.invalidState("Missing task in change")
        }
        
        // Validate vector clock
        if vectorClock.count > VECTOR_CLOCK_PRUNE_THRESHOLD {
            throw CRDTError.vectorClockOverflow
        }
        
        // Apply change based on type
        var updatedTask = task
        updatedTask.vectorClock = vectorClock
        updatedTask.lastModified = Date()
        
        return updatedTask
    }
    
    private func processBatch(_ remoteBatch: [Task], _ localTasks: [Task]) throws -> [Task] {
        return try remoteBatch.map { remoteTask in
            if let localTask = localTasks.first(where: { $0.id == remoteTask.id }) {
                return try handleConflict(remoteTask, localTask)
            }
            return remoteTask
        }
    }
    
    private func handleConflict(_ task1: Task, _ task2: Task) throws -> Task {
        let clock1 = task1.vectorClock
        let clock2 = task2.vectorClock
        
        switch compareVectorClocks(clock1, clock2) {
        case .before:
            return task2
        case .after:
            return task1
        case .concurrent:
            // Resolve using last-write-wins with microsecond precision
            if task1.lastModified > task2.lastModified {
                mergePublisher.send(.conflictResolved(task1.id))
                return task1
            } else {
                mergePublisher.send(.conflictResolved(task2.id))
                return task2
            }
        }
    }
    
    @inline(__always)
    private func compareVectorClocks(_ clock1: [String: Int], _ clock2: [String: Int]) -> CausalityResult {
        var concurrent = false
        
        for (node, count1) in clock1 {
            let count2 = clock2[node] ?? 0
            if count1 > count2 {
                concurrent = true
            } else if count2 > count1 {
                return .before
            }
        }
        
        for (node, count2) in clock2 where clock1[node] == nil {
            if count2 > 0 {
                return .before
            }
        }
        
        return concurrent ? .concurrent : .after
    }
    
    private func pruneVectorClockIfNeeded() {
        guard vectorClock.count > VECTOR_CLOCK_PRUNE_THRESHOLD else { return }
        
        // Remove oldest entries while keeping recent ones
        let sortedEntries = vectorClock.sorted { $0.value > $1.value }
        vectorClock = Dictionary(uniqueKeysWithValues: sortedEntries.prefix(VECTOR_CLOCK_PRUNE_THRESHOLD / 2))
    }
    
    private func updatePerformanceMetrics(duration: TimeInterval) {
        performanceMetrics.mergeLatency = duration
        performanceMetrics.syncAttempts += 1
        performanceMetrics.lastSyncTimestamp = Date()
    }
    
    private func setupPerformanceMonitoring() {
        Timer.scheduledTimer(withTimeInterval: 300, repeats: true) { [weak self] _ in
            self?.queue.async {
                guard let self = self else { return }
                Logger.shared.performance("""
                    CRDT Performance Metrics:
                    - Average Merge Latency: \(self.performanceMetrics.mergeLatency)s
                    - Conflict Rate: \(self.performanceMetrics.conflictRate)%
                    - Sync Attempts: \(self.performanceMetrics.syncAttempts)
                    """)
            }
        }
    }
    
    private func withTimeout<T>(_ timeout: TimeInterval, operation: () throws -> T) throws -> T {
        let semaphore = DispatchSemaphore(value: 0)
        var result: Result<T, Error>?
        
        queue.async {
            do {
                let value = try operation()
                result = .success(value)
            } catch {
                result = .failure(error)
            }
            semaphore.signal()
        }
        
        guard case .success = semaphore.wait(timeout: .now() + timeout) else {
            throw CRDTError.mergeTimeout
        }
        
        switch result {
        case .some(.success(let value)):
            return value
        case .some(.failure(let error)):
            throw error
        case .none:
            throw CRDTError.mergeTimeout
        }
    }
}

// MARK: - Supporting Types

private enum CausalityResult {
    case before
    case after
    case concurrent
}