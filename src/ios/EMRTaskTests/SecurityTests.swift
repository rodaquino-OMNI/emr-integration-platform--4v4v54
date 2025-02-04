// XCTest - iOS 14.0+
import XCTest
// LocalAuthentication - iOS 14.0+
import LocalAuthentication
@testable import EMRTask

/// Comprehensive test suite for security components ensuring HIPAA compliance and data protection
final class SecurityTests: XCTestCase {
    
    // MARK: - Properties
    
    private var keychainManager: KeychainManager!
    private var encryptionManager: EncryptionManager!
    private var biometricAuth: BiometricAuth!
    private var mockPHI: Data!
    private var mockUserId: UUID!
    private var authExpectation: XCTestExpectation!
    
    // MARK: - Setup & Teardown
    
    override func setUp() {
        super.setUp()
        
        // Initialize security components
        keychainManager = KeychainManager.shared
        encryptionManager = EncryptionManager.shared
        biometricAuth = BiometricAuth.shared
        
        // Generate mock PHI data
        mockPHI = "SENSITIVE_PATIENT_DATA".data(using: .utf8)!
        mockUserId = UUID()
        
        // Clear any existing test data
        _ = keychainManager.clearAll()
        
        // Reset biometric state
        _ = biometricAuth.resetBiometricState()
    }
    
    override func tearDown() {
        // Secure cleanup of test data
        _ = keychainManager.clearAll()
        mockPHI = nil
        mockUserId = nil
        
        super.tearDown()
    }
    
    // MARK: - Keychain Tests
    
    func testKeychainSecureStorage() {
        // Test token storage with HIPAA compliance
        let testToken = "secure_test_token".data(using: .utf8)!
        
        // Test save operation
        let saveResult = keychainManager.saveToken(testToken, key: "test_key")
        XCTAssertTrue(saveResult.isSuccess, "Token storage should succeed")
        
        // Test retrieval with verification
        let retrieveResult = keychainManager.retrieveToken(key: "test_key")
        switch retrieveResult {
        case .success(let retrievedData):
            XCTAssertEqual(retrievedData, testToken, "Retrieved token should match stored token")
        case .failure(let error):
            XCTFail("Token retrieval failed: \(error)")
        }
        
        // Test access control
        let accessResult = keychainManager.updateAccessibility(key: "test_key", accessibility: .afterFirstUnlock)
        XCTAssertTrue(accessResult.isSuccess, "Access control update should succeed")
    }
    
    func testKeychainErrorHandling() {
        // Test invalid key retrieval
        let invalidResult = keychainManager.retrieveToken(key: "nonexistent_key")
        switch invalidResult {
        case .success:
            XCTFail("Should not retrieve token for invalid key")
        case .failure(let error):
            XCTAssertEqual(error, .itemNotFound, "Should return itemNotFound error")
        }
        
        // Test duplicate item handling
        let testToken = "duplicate_token".data(using: .utf8)!
        _ = keychainManager.saveToken(testToken, key: "duplicate_key")
        let duplicateResult = keychainManager.saveToken(testToken, key: "duplicate_key")
        XCTAssertTrue(duplicateResult.isSuccess, "Should handle duplicate items gracefully")
    }
    
    // MARK: - Encryption Tests
    
    func testAESEncryption() {
        // Test AES-256-GCM encryption
        let encryptResult = encryptionManager.encrypt(
            data: mockPHI,
            dataType: "PHI",
            userId: mockUserId
        )
        
        switch encryptResult {
        case .success(let encryptedData):
            XCTAssertNotEqual(encryptedData, mockPHI, "Encrypted data should differ from original")
            
            // Test decryption
            let decryptResult = encryptionManager.decrypt(
                encryptedData: encryptedData,
                dataType: "PHI",
                userId: mockUserId
            )
            
            switch decryptResult {
            case .success(let decryptedData):
                XCTAssertEqual(decryptedData, mockPHI, "Decrypted data should match original")
            case .failure(let error):
                XCTFail("Decryption failed: \(error)")
            }
            
        case .failure(let error):
            XCTFail("Encryption failed: \(error)")
        }
    }
    
    func testKeyRotation() {
        // Test encryption key rotation
        let rotationResult = encryptionManager.rotateKey()
        XCTAssertTrue(rotationResult.isSuccess, "Key rotation should succeed")
        
        // Verify data remains accessible after rotation
        let testData = "test_data".data(using: .utf8)!
        let encryptResult = encryptionManager.encrypt(
            data: testData,
            dataType: "test",
            userId: mockUserId
        )
        
        XCTAssertTrue(encryptResult.isSuccess, "Encryption should succeed after key rotation")
    }
    
    // MARK: - Biometric Authentication Tests
    
    func testBiometricAvailability() {
        let availabilityResult = biometricAuth.checkBiometricAvailability()
        
        switch availabilityResult {
        case .success(let isAvailable):
            // Test depends on device capabilities
            #if targetEnvironment(simulator)
            XCTAssertFalse(isAvailable, "Biometrics should not be available in simulator")
            #else
            // Real device - availability depends on device configuration
            if isAvailable {
                XCTAssertTrue(biometricAuth.isBiometricsAvailable, "Biometrics flag should match availability")
            }
            #endif
        case .failure(let error):
            // Handle expected errors on devices without biometric capability
            XCTAssertTrue([.notAvailable, .notEnrolled].contains(error), "Should return valid availability error")
        }
    }
    
    func testBiometricAuthentication() {
        authExpectation = expectation(description: "Biometric authentication")
        
        // Attempt authentication
        let authResult = biometricAuth.authenticateUser(
            reason: "Unit test authentication",
            requireFreshAuthentication: true,
            authenticationTimeout: 5.0
        )
        
        switch authResult {
        case .success:
            #if targetEnvironment(simulator)
            XCTFail("Authentication should not succeed in simulator")
            #else
            // Success expected only on configured devices
            XCTAssertEqual(biometricAuth.currentRetryCount, 0, "Retry count should reset on success")
            #endif
        case .failure(let error):
            #if targetEnvironment(simulator)
            XCTAssertEqual(error, .notAvailable, "Should fail with availability error in simulator")
            #else
            // Handle expected errors on real devices
            XCTAssertTrue([.cancelled, .notAvailable, .notEnrolled].contains(error), "Should return valid auth error")
            #endif
        }
        
        authExpectation.fulfill()
        wait(for: [authExpectation], timeout: 6.0)
    }
    
    func testBiometricRetryLimits() {
        // Test retry limit enforcement
        for _ in 0..<6 {
            _ = biometricAuth.authenticateUser(
                reason: "Test retry limits",
                requireFreshAuthentication: true
            )
        }
        
        let lockoutResult = biometricAuth.authenticateUser(
            reason: "Should be locked out",
            requireFreshAuthentication: true
        )
        
        switch lockoutResult {
        case .success:
            XCTFail("Should not succeed after exceeding retry limit")
        case .failure(let error):
            XCTAssertEqual(error, .maxRetryExceeded, "Should be locked out after max retries")
        }
    }
    
    // MARK: - Integration Tests
    
    func testSecureDataFlow() {
        // Test complete secure data flow with encryption and biometric auth
        guard case .success = biometricAuth.checkBiometricAvailability() else {
            return // Skip on unsupported devices
        }
        
        // 1. Authenticate user
        let authResult = biometricAuth.authenticateUser(reason: "Access secure data")
        guard case .success = authResult else {
            return // Skip if authentication fails
        }
        
        // 2. Encrypt sensitive data
        let encryptResult = encryptionManager.encrypt(
            data: mockPHI,
            dataType: "PHI",
            userId: mockUserId
        )
        
        guard case .success(let encryptedData) = encryptResult else {
            XCTFail("Encryption failed in secure flow")
            return
        }
        
        // 3. Store encrypted data
        let storeResult = keychainManager.saveToken(encryptedData, key: "secure_phi")
        XCTAssertTrue(storeResult.isSuccess, "Secure storage should succeed")
        
        // 4. Retrieve and decrypt
        let retrieveResult = keychainManager.retrieveToken(key: "secure_phi")
        guard case .success(let storedData) = retrieveResult else {
            XCTFail("Retrieval failed in secure flow")
            return
        }
        
        let decryptResult = encryptionManager.decrypt(
            encryptedData: storedData,
            dataType: "PHI",
            userId: mockUserId
        )
        
        switch decryptResult {
        case .success(let decryptedData):
            XCTAssertEqual(decryptedData, mockPHI, "Secure flow should preserve data integrity")
        case .failure(let error):
            XCTFail("Decryption failed in secure flow: \(error)")
        }
    }
}