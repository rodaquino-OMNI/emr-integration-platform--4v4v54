// UIKit - iOS 14.0+
import UIKit
// BackgroundTasks - iOS 14.0+
import BackgroundTasks
// UserNotifications - iOS 14.0+
import UserNotifications

/// Background sync task identifier
private let BACKGROUND_SYNC_IDENTIFIER = "com.emrtask.backgroundSync"
/// Default background sync interval (15 minutes)
private let BACKGROUND_SYNC_INTERVAL: TimeInterval = 900
/// Sync operation timeout
private let SYNC_TIMEOUT_INTERVAL: TimeInterval = 30
/// Maximum retry attempts for operations
private let MAX_RETRY_ATTEMPTS = 3

/// Main application delegate implementing core application lifecycle and background task management
@main
@available(iOS 14.0, *)
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    
    // MARK: - Properties
    
    /// Main application window
    var window: UIWindow?
    
    /// Counter for sync retry attempts
    private var syncRetryCount: Int = 0
    
    /// Timestamp of last successful sync
    private var lastSyncTime: Date?
    
    /// Set of performance metrics
    private var performanceMetrics: [String: Any] = [:]
    
    // MARK: - Application Lifecycle
    
    func application(_ application: UIApplication,
                    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        
        // Initialize logger with performance tracking
        Logger.shared.info("Application starting - Version: \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown")")
        
        do {
            // Initialize offline database with integrity check
            try initializeOfflineStorage()
            
            // Configure background task scheduling
            configureBackgroundTasks()
            
            // Configure notifications with privacy considerations
            configureNotifications()
            
            // Initialize sync manager with performance monitoring
            initializeSyncManager()
            
            Logger.shared.info("Application initialization completed successfully")
            return true
        } catch {
            Logger.shared.critical("Application initialization failed", error: error)
            return false
        }
    }
    
    // MARK: - Background Tasks
    
    private func configureBackgroundTasks() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: BACKGROUND_SYNC_IDENTIFIER,
            using: nil
        ) { [weak self] task in
            self?.handleBackgroundSync(task as! BGAppRefreshTask)
        }
        
        scheduleBackgroundSync()
    }
    
    private func handleBackgroundSync(_ task: BGAppRefreshTask) {
        // Set expiration handler
        task.expirationHandler = { [weak self] in
            self?.handleSyncTimeout()
        }
        
        // Start performance monitoring
        let startTime = Date()
        
        // Execute sync operation
        SyncManager.shared.startSync().fold(
            onSuccess: { [weak self] in
                self?.handleSyncSuccess(startTime: startTime)
                task.setTaskCompleted(success: true)
                self?.scheduleBackgroundSync()
            },
            onFailure: { [weak self] error in
                self?.handleSyncError(error)
                task.setTaskCompleted(success: false)
                self?.scheduleBackgroundSync()
            }
        )
    }
    
    private func scheduleBackgroundSync() {
        let request = BGAppRefreshTaskRequest(identifier: BACKGROUND_SYNC_IDENTIFIER)
        
        // Adjust sync interval based on battery level and network quality
        let adjustedInterval = calculateOptimalSyncInterval()
        request.earliestBeginDate = Date(timeIntervalSinceNow: adjustedInterval)
        
        do {
            try BGTaskScheduler.shared.submit(request)
            Logger.shared.info("Background sync scheduled for \(adjustedInterval) seconds from now")
        } catch {
            Logger.shared.error("Failed to schedule background sync", error: error)
        }
    }
    
    // MARK: - Initialization Helpers
    
    private func initializeOfflineStorage() throws {
        let startTime = Date()
        
        // Initialize database with integrity check
        try OfflineDatabase.shared.checkIntegrity().get()
        
        let duration = Date().timeIntervalSince(startTime)
        Logger.shared.performance("Offline storage initialized in \(duration)s")
    }
    
    private func initializeSyncManager() {
        SyncManager.shared.configureSyncInterval(BACKGROUND_SYNC_INTERVAL)
        
        // Start initial sync if needed
        if NetworkMonitor.shared.isConnected {
            _ = SyncManager.shared.startSync()
        }
    }
    
    private func configureNotifications() {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        
        center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if let error = error {
                Logger.shared.error("Notification authorization failed", error: error)
                return
            }
            
            if granted {
                Logger.shared.info("Notification authorization granted")
            } else {
                Logger.shared.info("Notification authorization denied")
            }
        }
    }
    
    // MARK: - Error Handling
    
    private func handleSyncTimeout() {
        Logger.shared.error("Background sync timed out")
        NotificationCenter.default.post(
            name: NotificationConstants.syncFailed,
            object: nil,
            userInfo: ["error": "Sync operation timed out"]
        )
    }
    
    private func handleSyncSuccess(startTime: Date) {
        let duration = Date().timeIntervalSince(startTime)
        lastSyncTime = Date()
        syncRetryCount = 0
        
        Logger.shared.performance("Background sync completed in \(duration)s")
        updatePerformanceMetrics(syncDuration: duration)
    }
    
    private func handleSyncError(_ error: Error) {
        syncRetryCount += 1
        Logger.shared.error("Background sync failed", error: error)
        
        if syncRetryCount < MAX_RETRY_ATTEMPTS {
            let backoffInterval = calculateBackoffInterval()
            scheduleBackgroundSync(after: backoffInterval)
        } else {
            syncRetryCount = 0
            NotificationCenter.default.post(
                name: NotificationConstants.syncFailed,
                object: nil,
                userInfo: ["error": error]
            )
        }
    }
    
    // MARK: - Utility Methods
    
    private func calculateOptimalSyncInterval() -> TimeInterval {
        let baseInterval = BACKGROUND_SYNC_INTERVAL
        
        // Adjust based on battery level
        if UIDevice.current.batteryLevel <= 0.2 {
            return baseInterval * 2
        }
        
        // Adjust based on network quality
        switch NetworkMonitor.shared.connectionQuality {
        case .poor:
            return baseInterval * 1.5
        case .excellent:
            return baseInterval * 0.75
        default:
            return baseInterval
        }
    }
    
    private func calculateBackoffInterval() -> TimeInterval {
        return Double(min(syncRetryCount * 2, 10)) * 60
    }
    
    private func updatePerformanceMetrics(syncDuration: TimeInterval) {
        performanceMetrics["lastSyncDuration"] = syncDuration
        performanceMetrics["syncCount"] = (performanceMetrics["syncCount"] as? Int ?? 0) + 1
        performanceMetrics["averageSyncDuration"] = calculateAverageSyncDuration(syncDuration)
    }
    
    private func calculateAverageSyncDuration(_ duration: TimeInterval) -> TimeInterval {
        let count = performanceMetrics["syncCount"] as? Int ?? 1
        let currentAverage = performanceMetrics["averageSyncDuration"] as? TimeInterval ?? duration
        return ((currentAverage * Double(count - 1)) + duration) / Double(count)
    }
}