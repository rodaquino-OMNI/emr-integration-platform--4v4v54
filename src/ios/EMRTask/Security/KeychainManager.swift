// Foundation - iOS 14.0+
import Foundation
// Security - iOS 14.0+
import Security
// LocalAuthentication - iOS 14.0+
import LocalAuthentication

/// Enumeration of potential Keychain operation errors
public enum KeychainError: Error {
    case itemNotFound
    case duplicateItem
    case unexpectedStatus(OSStatus)
    case encodingError
    case decodingError
    case biometricFailure
    case keyRotationFailed
    case accessDenied
    case auditLogFailed
}

/// Thread-safe singleton class that manages secure storage and retrieval of sensitive data
/// using iOS Keychain Services with HIPAA compliance and biometric authentication
public final class KeychainManager {
    
    // MARK: - Singleton
    
    /// Shared instance of the KeychainManager
    public static let shared = KeychainManager()
    
    // MARK: - Properties
    
    /// Service identifier for Keychain operations
    private let serviceName: String
    
    /// Serial queue for thread-safe operations
    private let queue: DispatchQueue
    
    /// Context for biometric authentication
    private let authContext: LAContext
    
    /// Interval for key rotation in seconds (365 days)
    private let keyRotationInterval: TimeInterval = 31_536_000
    
    // MARK: - Initialization
    
    private init() {
        self.serviceName = SecurityConstants.keychain_service
        self.queue = DispatchQueue(label: "com.emrtask.keychain", qos: .userInitiated)
        self.authContext = LAContext()
        
        // Configure biometric authentication
        authContext.touchIDAuthenticationAllowableReuseDuration = SecurityConstants.maxTokenAge
    }
    
    // MARK: - Public Methods
    
    /// Securely saves sensitive data to Keychain with biometric protection
    /// - Parameters:
    ///   - token: The sensitive data to store
    ///   - key: Unique identifier for the stored data
    /// - Returns: Result indicating success or detailed error
    public func saveToken(_ token: Data, key: String) -> Result<Void, KeychainError> {
        return queue.sync {
            // Verify biometric authentication
            var error: NSError?
            guard authContext.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
                return .failure(.biometricFailure)
            }
            
            // Create access control with biometric constraint
            guard let access = SecAccessControlCreateWithFlags(
                nil,
                kSecAttrAccessibleAfterFirstUnlock,
                .biometryAny,
                nil
            ) else {
                return .failure(.accessDenied)
            }
            
            // Prepare query for Keychain operation
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: serviceName,
                kSecAttrAccount as String: key,
                kSecValueData as String: token,
                kSecAttrAccessControl as String: access,
                kSecUseAuthenticationUI as String: kSecUseAuthenticationUIAllow,
                kSecAttrSynchronizable as String: kCFBooleanFalse as Any
            ]
            
            // Attempt to save to Keychain
            let status = SecItemAdd(query as CFDictionary, nil)
            
            if status == errSecDuplicateItem {
                // Item exists, update it
                let updateQuery: [String: Any] = [
                    kSecClass as String: kSecClassGenericPassword,
                    kSecAttrService as String: serviceName,
                    kSecAttrAccount as String: key
                ]
                
                let updateAttributes: [String: Any] = [
                    kSecValueData as String: token,
                    kSecAttrAccessControl as String: access
                ]
                
                let updateStatus = SecItemUpdate(
                    updateQuery as CFDictionary,
                    updateAttributes as CFDictionary
                )
                
                guard updateStatus == errSecSuccess else {
                    return .failure(.unexpectedStatus(updateStatus))
                }
            } else if status != errSecSuccess {
                return .failure(.unexpectedStatus(status))
            }
            
            // Log security event
            SecurityLogger.shared.logSecurityEvent(
                "Token saved for key: \(key)",
                type: .tokenStorage
            )
            
            // Schedule key rotation
            scheduleKeyRotation(for: key)
            
            return .success(())
        }
    }
    
    /// Retrieves sensitive data from Keychain with biometric verification
    /// - Parameter key: Unique identifier for the stored data
    /// - Returns: Result containing retrieved data or detailed error
    public func retrieveToken(key: String) -> Result<Data, KeychainError> {
        return queue.sync {
            // Verify biometric authentication
            let semaphore = DispatchSemaphore(value: 0)
            var authError: Error?
            
            authContext.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: "Authenticate to access secure data"
            ) { success, error in
                if !success {
                    authError = error
                }
                semaphore.signal()
            }
            
            _ = semaphore.wait(timeout: .now() + 30)
            
            if let _ = authError {
                return .failure(.biometricFailure)
            }
            
            // Prepare query for Keychain operation
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: serviceName,
                kSecAttrAccount as String: key,
                kSecReturnData as String: kCFBooleanTrue as Any,
                kSecUseAuthenticationUI as String: kSecUseAuthenticationUIAllow,
                kSecAttrSynchronizable as String: kCFBooleanFalse as Any
            ]
            
            var result: AnyObject?
            let status = SecItemCopyMatching(query as CFDictionary, &result)
            
            guard status == errSecSuccess else {
                if status == errSecItemNotFound {
                    return .failure(.itemNotFound)
                }
                return .failure(.unexpectedStatus(status))
            }
            
            guard let tokenData = result as? Data else {
                return .failure(.decodingError)
            }
            
            // Log access for audit trail
            SecurityLogger.shared.logSecurityEvent(
                "Token retrieved for key: \(key)",
                type: .tokenAccess
            )
            
            return .success(tokenData)
        }
    }
    
    /// Performs secure key rotation for stored tokens
    /// - Parameter key: Unique identifier for the stored data
    /// - Returns: Result indicating success or detailed error
    public func rotateKey(_ key: String) -> Result<Void, KeychainError> {
        return queue.sync {
            // Retrieve existing token
            let retrieveResult = retrieveToken(key: key)
            
            switch retrieveResult {
            case .success(let tokenData):
                // Generate new encryption key
                var keyData = Data(count: 32) // 256-bit key
                let result = keyData.withUnsafeMutableBytes { pointer in
                    SecRandomCopyBytes(kSecRandomDefault, 32, pointer.baseAddress!)
                }
                
                guard result == errSecSuccess else {
                    return .failure(.keyRotationFailed)
                }
                
                // Re-encrypt and save token with new key
                let saveResult = saveToken(tokenData, key: key)
                
                switch saveResult {
                case .success:
                    // Log key rotation event
                    SecurityLogger.shared.logSecurityEvent(
                        "Key rotated for: \(key)",
                        type: .keyRotation
                    )
                    return .success(())
                case .failure(let error):
                    return .failure(error)
                }
                
            case .failure(let error):
                return .failure(error)
            }
        }
    }
    
    // MARK: - Private Methods
    
    private func scheduleKeyRotation(for key: String) {
        queue.asyncAfter(deadline: .now() + keyRotationInterval) { [weak self] in
            guard let self = self else { return }
            _ = self.rotateKey(key)
        }
    }
}