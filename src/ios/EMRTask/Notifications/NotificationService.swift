// UserNotifications - iOS 14.0+
import UserNotifications
// Foundation - iOS 14.0+
import Foundation

/// Priority levels for notifications with healthcare context
@objc public enum NotificationPriority: Int {
    case normal = 0
    case important = 1
    case critical = 2
}

/// Structure representing a queued notification item
private struct NotificationItem {
    let identifier: String
    let content: UNNotificationContent
    let trigger: UNNotificationTrigger
    let priority: NotificationPriority
    let retryCount: Int
}

/// Core service class that handles local and remote notification functionality
/// with enhanced reliability and healthcare-specific features
@objc public class NotificationService: NSObject {
    
    // MARK: - Constants
    
    private let NOTIFICATION_RETRY_DELAY: TimeInterval = 5.0
    private let MAX_NOTIFICATION_PAYLOAD_SIZE: Int = 4096
    private let MAX_RETRY_ATTEMPTS: Int = 3
    private let CRITICAL_ALERT_TIMEOUT: TimeInterval = 30.0
    
    // MARK: - Properties
    
    /// Shared singleton instance
    @objc public static let shared = NotificationService()
    
    /// Reference to system notification center
    private let notificationCenter: UNUserNotificationCenter
    
    /// Tracks registration status for remote notifications
    private(set) var isRegisteredForRemoteNotifications: Bool = false
    
    /// Set of active notification identifiers for tracking
    private var activeNotificationIds: Set<String> = []
    
    /// Dictionary tracking retry attempts for failed notifications
    private var retryCount: [String: Int] = [:]
    
    /// Queue for handling critical alerts with priority
    private var criticalAlertQueue: [NotificationItem] = []
    
    // MARK: - Initialization
    
    private override init() {
        self.notificationCenter = UNUserNotificationCenter.current()
        super.init()
        
        setupNotificationCenter()
    }
    
    // MARK: - Setup
    
    private func setupNotificationCenter() {
        // Request authorization with critical alert capability
        let options: UNAuthorizationOptions = [.alert, .sound, .badge, .criticalAlert]
        notificationCenter.requestAuthorization(options: options) { [weak self] granted, error in
            if let error = error {
                print("Failed to request notification authorization: \(error.localizedDescription)")
                return
            }
            if granted {
                self?.registerNotificationCategories()
            }
        }
        
        notificationCenter.delegate = self
    }
    
    // MARK: - Public Methods
    
    /// Schedules a local notification with enhanced reliability
    /// - Parameters:
    ///   - identifier: Unique identifier for the notification
    ///   - title: Notification title
    ///   - body: Notification body text
    ///   - triggerDate: Date to trigger the notification
    ///   - userInfo: Additional data payload
    ///   - priority: Priority level for the notification
    /// - Returns: Result indicating success or failure with error details
    @objc public func scheduleLocalNotification(
        identifier: String,
        title: String,
        body: String,
        triggerDate: Date,
        userInfo: [String: Any],
        priority: NotificationPriority
    ) -> Result<Void, Error> {
        // Validate payload size
        guard JSONSerialization.isValidJSONObject(userInfo),
              let data = try? JSONSerialization.data(withJSONObject: userInfo),
              data.count <= MAX_NOTIFICATION_PAYLOAD_SIZE else {
            return .failure(NSError(domain: "NotificationService",
                                  code: 1001,
                                  userInfo: [NSLocalizedDescriptionKey: "Payload size exceeds limit"]))
        }
        
        // Create notification content
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.userInfo = userInfo
        content.sound = priority == .critical ? .criticalSoundName : .defaultSound
        
        if priority == .critical {
            content.interruptionLevel = .critical
            content.relevanceScore = 1.0
        }
        
        // Create trigger
        let trigger = UNTimeIntervalNotificationTrigger(
            timeInterval: max(1, triggerDate.timeIntervalSinceNow),
            repeats: false
        )
        
        // Create request
        let request = UNNotificationRequest(
            identifier: identifier,
            content: content,
            trigger: trigger
        )
        
        // Add to notification center
        var result: Result<Void, Error> = .success(())
        let semaphore = DispatchSemaphore(value: 0)
        
        notificationCenter.add(request) { [weak self] error in
            if let error = error {
                result = .failure(error)
            } else {
                self?.activeNotificationIds.insert(identifier)
            }
            semaphore.signal()
        }
        
        _ = semaphore.wait(timeout: .now() + CRITICAL_ALERT_TIMEOUT)
        return result
    }
    
    /// Handles incoming remote notifications with enhanced security
    /// - Parameters:
    ///   - payload: Notification payload dictionary
    ///   - completion: Completion handler with result
    @objc public func handleRemoteNotification(
        payload: [String: Any],
        completion: @escaping (Result<Void, Error>) -> Void
    ) {
        // Validate payload
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              data.count <= MAX_NOTIFICATION_PAYLOAD_SIZE else {
            completion(.failure(NSError(domain: "NotificationService",
                                     code: 1002,
                                     userInfo: [NSLocalizedDescriptionKey: "Invalid payload"])))
            return
        }
        
        // Extract notification data
        guard let aps = payload["aps"] as? [String: Any],
              let identifier = payload["identifier"] as? String else {
            completion(.failure(NSError(domain: "NotificationService",
                                     code: 1003,
                                     userInfo: [NSLocalizedDescriptionKey: "Missing required fields"])))
            return
        }
        
        // Handle critical alerts
        if let critical = aps["critical"] as? Bool, critical {
            handleCriticalAlert(identifier: identifier, payload: payload)
        }
        
        // Process notification based on type
        switch payload["type"] as? String {
        case "taskUpdate":
            NotificationCenter.default.post(name: NotificationConstants.taskUpdated,
                                         object: nil,
                                         userInfo: payload)
        case "handover":
            NotificationCenter.default.post(name: NotificationConstants.handoverInitiated,
                                         object: nil,
                                         userInfo: payload)
        case "sync":
            NotificationCenter.default.post(name: NotificationConstants.syncCompleted,
                                         object: nil,
                                         userInfo: payload)
        default:
            break
        }
        
        completion(.success(()))
    }
    
    /// Cancels a scheduled notification with cleanup
    /// - Parameter identifier: Notification identifier to cancel
    @objc public func cancelNotification(identifier: String) {
        notificationCenter.removePendingNotificationRequests(withIdentifiers: [identifier])
        activeNotificationIds.remove(identifier)
        retryCount.removeValue(forKey: identifier)
    }
    
    // MARK: - Private Methods
    
    private func registerNotificationCategories() {
        // Task update category
        let completeAction = UNNotificationAction(
            identifier: "COMPLETE_TASK",
            title: "Complete Task",
            options: [.foreground]
        )
        
        let taskCategory = UNNotificationCategory(
            identifier: "TASK_UPDATE",
            actions: [completeAction],
            intentIdentifiers: [],
            options: [.customDismissAction]
        )
        
        // Handover category
        let acceptAction = UNNotificationAction(
            identifier: "ACCEPT_HANDOVER",
            title: "Accept",
            options: [.foreground]
        )
        
        let rejectAction = UNNotificationAction(
            identifier: "REJECT_HANDOVER",
            title: "Reject",
            options: [.foreground, .destructive]
        )
        
        let handoverCategory = UNNotificationCategory(
            identifier: "HANDOVER",
            actions: [acceptAction, rejectAction],
            intentIdentifiers: [],
            options: [.customDismissAction]
        )
        
        // Register categories
        notificationCenter.setNotificationCategories([taskCategory, handoverCategory])
    }
    
    private func handleCriticalAlert(identifier: String, payload: [String: Any]) {
        let content = UNMutableNotificationContent()
        content.title = payload["title"] as? String ?? "Critical Alert"
        content.body = payload["body"] as? String ?? ""
        content.userInfo = payload
        content.sound = .criticalSoundName
        content.interruptionLevel = .critical
        content.relevanceScore = 1.0
        
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        
        let item = NotificationItem(
            identifier: identifier,
            content: content,
            trigger: trigger,
            priority: .critical,
            retryCount: 0
        )
        
        criticalAlertQueue.append(item)
        processCriticalAlertQueue()
    }
    
    private func processCriticalAlertQueue() {
        guard !criticalAlertQueue.isEmpty else { return }
        
        let item = criticalAlertQueue.removeFirst()
        let request = UNNotificationRequest(
            identifier: item.identifier,
            content: item.content,
            trigger: item.trigger
        )
        
        notificationCenter.add(request) { [weak self] error in
            if let error = error {
                print("Failed to deliver critical alert: \(error.localizedDescription)")
                if item.retryCount < self?.MAX_RETRY_ATTEMPTS ?? 3 {
                    let updatedItem = NotificationItem(
                        identifier: item.identifier,
                        content: item.content,
                        trigger: item.trigger,
                        priority: item.priority,
                        retryCount: item.retryCount + 1
                    )
                    self?.criticalAlertQueue.append(updatedItem)
                    
                    DispatchQueue.main.asyncAfter(deadline: .now() + (self?.NOTIFICATION_RETRY_DELAY ?? 5.0)) {
                        self?.processCriticalAlertQueue()
                    }
                }
            }
        }
    }
}

// MARK: - UNUserNotificationCenterDelegate

extension NotificationService: UNUserNotificationCenterDelegate {
    public func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // Always show critical alerts
        if notification.request.content.interruptionLevel == .critical {
            completionHandler([.banner, .sound, .badge])
            return
        }
        
        // Show banner for important notifications
        if notification.request.content.relevanceScore == 1.0 {
            completionHandler([.banner, .sound])
            return
        }
        
        // Default presentation options
        completionHandler([.list, .badge])
    }
    
    public func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        
        switch response.actionIdentifier {
        case "COMPLETE_TASK":
            NotificationCenter.default.post(name: NotificationConstants.taskUpdated,
                                         object: nil,
                                         userInfo: userInfo)
        case "ACCEPT_HANDOVER", "REJECT_HANDOVER":
            NotificationCenter.default.post(name: NotificationConstants.handoverInitiated,
                                         object: nil,
                                         userInfo: userInfo)
        default:
            break
        }
        
        completionHandler()
    }
}

// MARK: - UNNotificationSound Extension

extension UNNotificationSound {
    static var criticalSoundName: UNNotificationSound {
        return UNNotificationSound.default
    }
}