// Foundation - iOS 14.0+
import Foundation

/// API configuration constants for maintaining 99.99% uptime requirement
public struct APIConstants {
    /// Base URL for API endpoints
    public static let baseURL = "https://api.emr-task.com"
    
    /// Current API version
    public static let apiVersion = "v1"
    
    /// Network request timeout in seconds
    public static let timeout: TimeInterval = 30.0
    
    /// Interval between retry attempts in seconds
    public static let retryInterval: TimeInterval = 1.0
    
    /// Maximum number of retry attempts for API calls
    public static let maxRetries: Int = 3
}

/// EMR integration constants supporting FHIR R4 and HL7 v2 adapters
public struct EMRConstants {
    /// FHIR specification version
    public static let fhirVersion = "R4"
    
    /// HL7 specification version
    public static let hl7Version = "v2"
    
    /// FHIR endpoint URL
    public static let fhirEndpoint = "\(APIConstants.baseURL)/fhir/r4"
    
    /// HL7 endpoint URL
    public static let hl7Endpoint = "\(APIConstants.baseURL)/hl7/v2"
    
    /// EMR request timeout in seconds
    public static let emrTimeout: TimeInterval = 45.0
}

/// Offline sync configuration constants ensuring < 500ms sync resolution
public struct SyncConstants {
    /// Maximum number of sync retry attempts
    public static let maxRetryAttempts: Int = 5
    
    /// Interval between sync attempts in seconds
    public static let syncInterval: TimeInterval = 300.0 // 5 minutes
    
    /// Maximum offline storage size in bytes (1GB)
    public static let maxOfflineStorageSize: Int64 = 1_073_741_824
    
    /// Timeout for conflict resolution in milliseconds (500ms requirement)
    public static let conflictResolutionTimeout: TimeInterval = 0.5
    
    /// Number of items to sync in each batch
    public static let batchSyncSize: Int = 100
}

/// Security and encryption constants for HIPAA compliance
public struct SecurityConstants {
    /// Keychain service identifier
    public static let keychain_service = "com.emr-task.keychain"
    
    /// Encryption algorithm identifier
    public static let encryption_algorithm = "AES-256-GCM"
    
    /// Token expiration duration in seconds (1 hour)
    public static let token_expiry: TimeInterval = 3600.0
    
    /// Minimum required password length
    public static let minPasswordLength: Int = 12
    
    /// Maximum token age before forced refresh in seconds (12 hours)
    public static let maxTokenAge: TimeInterval = 43200.0
}

/// System-wide notification identifiers for state changes
public struct NotificationConstants {
    /// Posted when a task is updated
    public static let taskUpdated = Notification.Name("EMRTask.taskUpdated")
    
    /// Posted when a shift handover is initiated
    public static let handoverInitiated = Notification.Name("EMRTask.handoverInitiated")
    
    /// Posted when sync completes successfully
    public static let syncCompleted = Notification.Name("EMRTask.syncCompleted")
    
    /// Posted when sync fails
    public static let syncFailed = Notification.Name("EMRTask.syncFailed")
    
    /// Posted when EMR connection status changes
    public static let emrConnectionStatus = Notification.Name("EMRTask.emrConnectionStatus")
}

/// UI-related constants for consistent visual presentation
public struct UIConstants {
    /// Default animation duration in seconds
    public static let animationDuration: TimeInterval = 0.3
    
    /// Default corner radius for rounded elements
    public static let cornerRadius: CGFloat = 8.0
    
    /// Default padding/margin value
    public static let defaultPadding: CGFloat = 16.0
    
    /// Minimum touch target size (44x44 as per Apple HIG)
    public static let minimumTouchSize: CGFloat = 44.0
    
    /// Size for loading indicators
    public static let loadingIndicatorSize: CGFloat = 32.0
}