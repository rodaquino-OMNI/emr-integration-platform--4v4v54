// Foundation - iOS 14.0+
import Foundation
// LocalAuthentication - iOS 14.0+
import LocalAuthentication

/// Comprehensive error types for biometric authentication operations
public enum BiometricAuthError: Error {
    case notAvailable
    case notEnrolled
    case lockout
    case cancelled
    case failed
    case unknown
    case maxRetryExceeded
    case keyRotationFailed
    case auditLogFailed
    case secureStorageFailed
}

/// Thread-safe singleton class managing HIPAA-compliant biometric authentication
public final class BiometricAuth {
    
    // MARK: - Singleton
    
    /// Shared instance of BiometricAuth
    public static let shared = BiometricAuth()
    
    // MARK: - Properties
    
    /// Local Authentication context
    private let context: LAContext
    
    /// Serial queue for thread-safe operations
    private let queue: DispatchQueue
    
    /// Indicates if biometric authentication is available
    public private(set) var isBiometricsAvailable: Bool
    
    /// Maximum number of retry attempts before lockout
    private let maxRetryAttempts: Int = 5
    
    /// Duration of lockout in seconds (5 minutes)
    private let lockoutDuration: TimeInterval = 300
    
    /// Timestamp of last authentication attempt
    private var lastAuthenticationAttempt: Date?
    
    /// Current number of retry attempts
    private var currentRetryCount: Int = 0
    
    // MARK: - Initialization
    
    private init() {
        // Initialize LAContext with maximum security
        self.context = LAContext()
        context.interactionNotAllowed = false
        context.localizedFallbackTitle = ""
        context.touchIDAuthenticationAllowableReuseDuration = 0
        
        // Create serial queue for thread-safe operations
        self.queue = DispatchQueue(label: "com.emrtask.biometric", qos: .userInitiated)
        
        // Check biometric availability
        var error: NSError?
        self.isBiometricsAvailable = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
        
        // Configure secure state persistence
        configureBiometricState()
    }
    
    // MARK: - Public Methods
    
    /// Checks biometric authentication availability
    /// - Returns: Result indicating availability status with detailed error information
    public func checkBiometricAvailability() -> Result<Bool, BiometricAuthError> {
        return queue.sync {
            var error: NSError?
            let canEvaluate = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
            
            if let error = error {
                switch error.code {
                case LAError.biometryNotEnrolled.rawValue:
                    return .failure(.notEnrolled)
                case LAError.biometryLockout.rawValue:
                    return .failure(.lockout)
                default:
                    return .failure(.notAvailable)
                }
            }
            
            self.isBiometricsAvailable = canEvaluate
            return .success(canEvaluate)
        }
    }
    
    /// Authenticates user with biometric verification
    /// - Parameters:
    ///   - reason: Localized reason for authentication request
    ///   - requireFreshAuthentication: Forces a new biometric scan
    ///   - authenticationTimeout: Maximum time allowed for authentication
    /// - Returns: Result indicating authentication success or detailed error
    public func authenticateUser(
        reason: String,
        requireFreshAuthentication: Bool = true,
        authenticationTimeout: TimeInterval = 30.0
    ) -> Result<Bool, BiometricAuthError> {
        return queue.sync {
            // Check retry attempts and lockout
            if let lastAttempt = lastAuthenticationAttempt,
               currentRetryCount >= maxRetryAttempts,
               Date().timeIntervalSince(lastAttempt) < lockoutDuration {
                return .failure(.maxRetryExceeded)
            }
            
            // Reset context for fresh authentication if required
            if requireFreshAuthentication {
                context.touchIDAuthenticationAllowableReuseDuration = 0
            }
            
            // Create semaphore for synchronous authentication
            let semaphore = DispatchSemaphore(value: 0)
            var authenticationResult: Result<Bool, BiometricAuthError> = .failure(.unknown)
            
            // Attempt biometric authentication
            context.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: reason
            ) { success, error in
                if success {
                    // Reset retry count on success
                    self.currentRetryCount = 0
                    authenticationResult = .success(true)
                } else if let error = error as? LAError {
                    switch error.code {
                    case .userCancel:
                        authenticationResult = .failure(.cancelled)
                    case .biometryLockout:
                        authenticationResult = .failure(.lockout)
                    case .authenticationFailed:
                        self.currentRetryCount += 1
                        self.lastAuthenticationAttempt = Date()
                        authenticationResult = .failure(.failed)
                    default:
                        authenticationResult = .failure(.unknown)
                    }
                }
                semaphore.signal()
            }
            
            // Wait for authentication with timeout
            _ = semaphore.wait(timeout: .now() + authenticationTimeout)
            
            // Log authentication attempt
            logAuthenticationAttempt(result: authenticationResult)
            
            // Update secure state
            updateSecureState(result: authenticationResult)
            
            return authenticationResult
        }
    }
    
    /// Resets biometric authentication state
    /// - Returns: Result indicating reset success or detailed error
    public func resetBiometricState() -> Result<Void, BiometricAuthError> {
        return queue.sync {
            do {
                // Clear stored authentication state
                try KeychainManager.shared.saveToken(Data(), key: "biometric_state")
                
                // Reset counters and timestamps
                currentRetryCount = 0
                lastAuthenticationAttempt = nil
                
                // Log reset operation
                logSecurityEvent("Biometric state reset")
                
                return .success(())
            } catch {
                return .failure(.secureStorageFailed)
            }
        }
    }
    
    // MARK: - Private Methods
    
    private func configureBiometricState() {
        // Retrieve stored state from keychain
        let result = KeychainManager.shared.retrieveToken(key: "biometric_state")
        switch result {
        case .success(let data):
            // Parse and validate stored state
            if let state = try? JSONDecoder().decode([String: Any].self, from: data) as? [String: Any] {
                if let retryCount = state["retryCount"] as? Int {
                    self.currentRetryCount = retryCount
                }
                if let lastAttempt = state["lastAttempt"] as? Date {
                    self.lastAuthenticationAttempt = lastAttempt
                }
            }
        case .failure:
            // Initialize new state if none exists
            updateSecureState(result: .success(true))
        }
    }
    
    private func updateSecureState(result: Result<Bool, BiometricAuthError>) {
        let state: [String: Any] = [
            "retryCount": currentRetryCount,
            "lastAttempt": lastAuthenticationAttempt as Any,
            "lastResult": result.isSuccess
        ]
        
        guard let data = try? JSONSerialization.data(withJSONObject: state) else {
            return
        }
        
        _ = KeychainManager.shared.saveToken(data, key: "biometric_state")
    }
    
    private func logAuthenticationAttempt(result: Result<Bool, BiometricAuthError>) {
        let eventType = result.isSuccess ? "Authentication succeeded" : "Authentication failed"
        logSecurityEvent("\(eventType) - Retry count: \(currentRetryCount)")
    }
    
    private func logSecurityEvent(_ message: String) {
        Logger.shared.debug("[BiometricAuth] \(message)")
    }
}

// MARK: - Result Extension

private extension Result {
    var isSuccess: Bool {
        switch self {
        case .success:
            return true
        case .failure:
            return false
        }
    }
}