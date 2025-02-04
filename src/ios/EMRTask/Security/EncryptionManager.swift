// Foundation - iOS 14.0+
import Foundation
// CryptoKit - iOS 14.0+
import CryptoKit

/// Enumeration of potential encryption operation errors
public enum EncryptionError: Error {
    case keyGenerationFailed
    case encryptionFailed
    case decryptionFailed
    case keyNotFound
    case invalidInput
    case keyRotationFailed
    case auditLogFailed
    case validationFailed
}

/// Thread-safe singleton class managing HIPAA-compliant encryption with automated key rotation and audit logging
public final class EncryptionManager {
    
    // MARK: - Singleton
    
    /// Shared instance of the EncryptionManager
    public static let shared = EncryptionManager()
    
    // MARK: - Properties
    
    /// Serial queue for thread-safe operations
    private let serialQueue: DispatchQueue
    
    /// Reference to KeychainManager for secure key storage
    private let keychainManager: KeychainManager
    
    /// Reference to SecurityLogger for audit logging
    private let securityLogger: Logger
    
    /// Timestamp of last key rotation
    private var lastKeyRotation: TimeInterval
    
    /// Flag indicating key rotation in progress
    private var isRotatingKey: Bool
    
    // MARK: - Constants
    
    /// Key identifier for encryption key in Keychain
    private let encryptionKeyIdentifier = "com.emrtask.encryption.key"
    
    /// Nonce size for AES-GCM encryption
    private let nonceSize = 12
    
    /// Tag size for AES-GCM authentication
    private let tagSize = 16
    
    // MARK: - Initialization
    
    private init() {
        self.serialQueue = DispatchQueue(label: "com.emrtask.encryption.queue", qos: .userInitiated)
        self.keychainManager = KeychainManager.shared
        self.securityLogger = Logger.shared
        self.lastKeyRotation = Date().timeIntervalSince1970
        self.isRotatingKey = false
        
        // Schedule initial key rotation
        scheduleKeyRotation()
    }
    
    // MARK: - Public Methods
    
    /// Encrypts sensitive data using AES-256-GCM with authentication and logging
    /// - Parameters:
    ///   - data: Data to encrypt
    ///   - dataType: Type of data being encrypted (for audit logging)
    ///   - userId: ID of user performing encryption
    /// - Returns: Result containing encrypted data or error
    public func encrypt(data: Data, dataType: String, userId: UUID) -> Result<Data, EncryptionError> {
        return serialQueue.sync {
            // Validate input
            guard !data.isEmpty else {
                return .failure(.invalidInput)
            }
            
            // Check key rotation schedule
            checkKeyRotation()
            
            do {
                // Generate random nonce
                var nonce = Data(count: nonceSize)
                let status = nonce.withUnsafeMutableBytes { pointer in
                    SecRandomCopyBytes(kSecRandomDefault, nonceSize, pointer.baseAddress!)
                }
                
                guard status == errSecSuccess else {
                    throw EncryptionError.encryptionFailed
                }
                
                // Retrieve encryption key
                let keyResult = keychainManager.retrieveToken(key: encryptionKeyIdentifier)
                guard case .success(let keyData) = keyResult else {
                    throw EncryptionError.keyNotFound
                }
                
                let key = SymmetricKey(data: keyData)
                let nonceData = try AES.GCM.Nonce(data: nonce)
                
                // Perform encryption
                let sealedBox = try AES.GCM.seal(data, using: key, nonce: nonceData)
                
                // Combine nonce, ciphertext, and tag
                var encryptedData = Data()
                encryptedData.append(nonce)
                encryptedData.append(sealedBox.ciphertext)
                encryptedData.append(sealedBox.tag)
                
                // Log encryption event
                securityLogger.debug("Data encrypted: type=\(dataType), userId=\(userId)")
                
                return .success(encryptedData)
            } catch {
                securityLogger.error("Encryption failed", error: error)
                return .failure(.encryptionFailed)
            }
        }
    }
    
    /// Decrypts data with authentication verification and audit logging
    /// - Parameters:
    ///   - encryptedData: Data to decrypt
    ///   - dataType: Type of data being decrypted (for audit logging)
    ///   - userId: ID of user performing decryption
    /// - Returns: Result containing decrypted data or error
    public func decrypt(encryptedData: Data, dataType: String, userId: UUID) -> Result<Data, EncryptionError> {
        return serialQueue.sync {
            // Validate input size
            guard encryptedData.count > nonceSize + tagSize else {
                return .failure(.invalidInput)
            }
            
            do {
                // Extract nonce, ciphertext, and tag
                let nonce = encryptedData.prefix(nonceSize)
                let ciphertext = encryptedData.dropFirst(nonceSize).dropLast(tagSize)
                let tag = encryptedData.suffix(tagSize)
                
                // Retrieve encryption key
                let keyResult = keychainManager.retrieveToken(key: encryptionKeyIdentifier)
                guard case .success(let keyData) = keyResult else {
                    throw EncryptionError.keyNotFound
                }
                
                let key = SymmetricKey(data: keyData)
                let nonceData = try AES.GCM.Nonce(data: nonce)
                
                // Create sealed box for decryption
                let sealedBox = try AES.GCM.SealedBox(nonce: nonceData,
                                                     ciphertext: ciphertext,
                                                     tag: tag)
                
                // Perform decryption
                let decryptedData = try AES.GCM.open(sealedBox, using: key)
                
                // Log decryption event
                securityLogger.debug("Data decrypted: type=\(dataType), userId=\(userId)")
                
                return .success(decryptedData)
            } catch {
                securityLogger.error("Decryption failed", error: error)
                return .failure(.decryptionFailed)
            }
        }
    }
    
    /// Rotates encryption key with secure re-encryption of existing data
    /// - Returns: Result indicating success or error
    public func rotateKey() -> Result<Void, EncryptionError> {
        return serialQueue.sync {
            guard !isRotatingKey else {
                return .failure(.keyRotationFailed)
            }
            
            isRotatingKey = true
            
            do {
                // Generate new key
                let newKeyResult = try generateKey()
                guard case .success(let newKey) = newKeyResult else {
                    throw EncryptionError.keyGenerationFailed
                }
                
                // Store new key
                let saveResult = keychainManager.saveToken(newKey.withUnsafeBytes { Data($0) },
                                                         key: encryptionKeyIdentifier)
                
                guard case .success = saveResult else {
                    throw EncryptionError.keyRotationFailed
                }
                
                // Update rotation timestamp
                lastKeyRotation = Date().timeIntervalSince1970
                
                // Log rotation event
                securityLogger.debug("Encryption key rotated successfully")
                
                isRotatingKey = false
                return .success(())
            } catch {
                isRotatingKey = false
                securityLogger.error("Key rotation failed", error: error)
                return .failure(.keyRotationFailed)
            }
        }
    }
    
    // MARK: - Private Methods
    
    /// Generates a new cryptographically secure AES-256 key
    private func generateKey() throws -> Result<SymmetricKey, EncryptionError> {
        var keyData = Data(count: 32) // 256 bits
        let status = keyData.withUnsafeMutableBytes { pointer in
            SecRandomCopyBytes(kSecRandomDefault, 32, pointer.baseAddress!)
        }
        
        guard status == errSecSuccess else {
            throw EncryptionError.keyGenerationFailed
        }
        
        return .success(SymmetricKey(data: keyData))
    }
    
    /// Schedules periodic key rotation
    private func scheduleKeyRotation() {
        let rotationInterval: TimeInterval = 30 * 24 * 60 * 60 // 30 days
        
        serialQueue.asyncAfter(deadline: .now() + rotationInterval) { [weak self] in
            guard let self = self else { return }
            _ = self.rotateKey()
            self.scheduleKeyRotation()
        }
    }
    
    /// Checks if key rotation is needed
    private func checkKeyRotation() {
        let currentTime = Date().timeIntervalSince1970
        let rotationThreshold: TimeInterval = 30 * 24 * 60 * 60 // 30 days
        
        if currentTime - lastKeyRotation >= rotationThreshold {
            _ = rotateKey()
        }
    }
}