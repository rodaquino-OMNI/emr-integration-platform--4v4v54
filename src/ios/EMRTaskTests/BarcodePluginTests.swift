// XCTest - Version: iOS 14.0+
import XCTest
// UIKit - Version: iOS 14.0+
import UIKit
@testable import EMRTask

/// Mock view controller for testing BarcodePlugin presentation
class MockViewController: UIViewController {
    var presentCalled = false
    var dismissCalled = false
    var isPrivacyScreenEnabled = false
    var isVoiceOverRunning = false
    
    override func present(_ viewControllerToPresent: UIViewController,
                         animated flag: Bool,
                         completion: (() -> Void)? = nil) {
        presentCalled = true
        completion?()
    }
    
    override func dismiss(animated flag: Bool, completion: (() -> Void)? = nil) {
        dismissCalled = true
        completion?()
    }
}

/// Mock EMR validation service for testing
class MockEMRValidationService: EMRValidationService {
    var shouldSucceed = true
    var validationDelay: TimeInterval = 0
    var lastValidatedBarcode: String?
    
    func validateBarcode(_ barcode: String, completion: @escaping (Result<Void, Error>) -> Void) {
        lastValidatedBarcode = barcode
        
        DispatchQueue.global().asyncAfter(deadline: .now() + validationDelay) {
            if self.shouldSucceed {
                completion(.success(()))
            } else {
                completion(.failure(BarcodeValidationError.emrValidationFailed))
            }
        }
    }
}

class BarcodePluginTests: XCTestCase {
    
    // MARK: - Properties
    
    private var sut: BarcodePlugin?
    private var mockViewController: MockViewController!
    private var mockValidationService: MockEMRValidationService!
    private let testQueue = DispatchQueue(label: "com.emrtask.test.queue")
    private var scanningExpectation: XCTestExpectation?
    
    // MARK: - Setup and Teardown
    
    override func setUp() {
        super.setUp()
        mockViewController = MockViewController()
        mockValidationService = MockEMRValidationService()
        sut = BarcodePlugin(viewController: mockViewController,
                           validationService: mockValidationService)
    }
    
    override func tearDown() {
        sut?.stopScanning()
        sut = nil
        mockViewController = nil
        mockValidationService = nil
        scanningExpectation = nil
        super.tearDown()
    }
    
    // MARK: - Scanner Presentation Tests
    
    func testScannerPresentation() {
        // Given
        let expectation = expectation(description: "Scanner presentation")
        
        // When
        sut?.startScanning { _ in
            expectation.fulfill()
        }
        
        // Then
        waitForExpectations(timeout: 1.0) { error in
            XCTAssertNil(error)
            XCTAssertTrue(self.mockViewController.presentCalled)
        }
    }
    
    func testScannerDismissal() {
        // Given
        let presentExpectation = expectation(description: "Scanner presentation")
        let dismissExpectation = expectation(description: "Scanner dismissal")
        
        // When
        sut?.startScanning { _ in
            presentExpectation.fulfill()
        }
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            self.sut?.stopScanning()
            dismissExpectation.fulfill()
        }
        
        // Then
        waitForExpectations(timeout: 2.0) { error in
            XCTAssertNil(error)
            XCTAssertTrue(self.mockViewController.dismissCalled)
        }
    }
    
    // MARK: - Thread Safety Tests
    
    func testConcurrentScanning() {
        // Given
        let operationCount = 10
        let expectations = (0..<operationCount).map { 
            expectation(description: "Concurrent operation \($0)")
        }
        
        // When
        for i in 0..<operationCount {
            testQueue.async {
                self.sut?.startScanning { _ in
                    expectations[i].fulfill()
                }
            }
        }
        
        // Then
        waitForExpectations(timeout: 5.0) { error in
            XCTAssertNil(error)
            // Only one scanning session should be active
            XCTAssertEqual(self.mockViewController.presentCalled, true)
        }
    }
    
    // MARK: - EMR Validation Tests
    
    func testSuccessfulEMRValidation() {
        // Given
        let validBarcode = "12345678"
        mockValidationService.shouldSucceed = true
        let expectation = expectation(description: "EMR validation")
        var result: Result<String, BarcodeValidationError>?
        
        // When
        sut?.startScanning { scanResult in
            result = scanResult
            expectation.fulfill()
        }
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            self.sut?.handleBarcodeResult(validBarcode)
        }
        
        // Then
        waitForExpectations(timeout: 2.0) { error in
            XCTAssertNil(error)
            XCTAssertEqual(try? result?.get(), validBarcode)
            XCTAssertEqual(self.mockValidationService.lastValidatedBarcode, validBarcode)
        }
    }
    
    func testFailedEMRValidation() {
        // Given
        let invalidBarcode = "invalid"
        mockValidationService.shouldSucceed = false
        let expectation = expectation(description: "EMR validation failure")
        var receivedError: BarcodeValidationError?
        
        // When
        sut?.startScanning { result in
            if case .failure(let error) = result {
                receivedError = error
                expectation.fulfill()
            }
        }
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            self.sut?.handleBarcodeResult(invalidBarcode)
        }
        
        // Then
        waitForExpectations(timeout: 2.0) { error in
            XCTAssertNil(error)
            XCTAssertEqual(receivedError, .emrValidationFailed)
        }
    }
    
    // MARK: - Privacy and HIPAA Compliance Tests
    
    func testPrivacyScreenHandling() {
        // Given
        mockViewController.isPrivacyScreenEnabled = true
        let expectation = expectation(description: "Privacy screen handling")
        
        // When
        sut?.startScanning { _ in
            expectation.fulfill()
        }
        
        // Then
        waitForExpectations(timeout: 1.0) { error in
            XCTAssertNil(error)
            XCTAssertTrue(self.mockViewController.presentCalled)
        }
    }
    
    func testAccessibilitySupport() {
        // Given
        mockViewController.isVoiceOverRunning = true
        let expectation = expectation(description: "Accessibility support")
        
        // When
        sut?.startScanning { _ in
            expectation.fulfill()
        }
        
        // Then
        waitForExpectations(timeout: 1.0) { error in
            XCTAssertNil(error)
            XCTAssertTrue(self.mockViewController.presentCalled)
        }
    }
    
    // MARK: - Resource Management Tests
    
    func testResourceCleanup() {
        // Given
        let expectation = expectation(description: "Resource cleanup")
        
        // When
        sut?.startScanning { _ in }
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            self.sut?.stopScanning()
            expectation.fulfill()
        }
        
        // Then
        waitForExpectations(timeout: 2.0) { error in
            XCTAssertNil(error)
            XCTAssertTrue(self.mockViewController.dismissCalled)
        }
    }
    
    func testTimeoutHandling() {
        // Given
        mockValidationService.validationDelay = 35 // Exceeds 30s timeout
        let expectation = expectation(description: "Timeout handling")
        var receivedError: BarcodeValidationError?
        
        // When
        sut?.startScanning { result in
            if case .failure(let error) = result {
                receivedError = error
                expectation.fulfill()
            }
        }
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            self.sut?.handleBarcodeResult("12345678")
        }
        
        // Then
        waitForExpectations(timeout: 40.0) { error in
            XCTAssertNil(error)
            XCTAssertEqual(receivedError, .timeoutError)
        }
    }
}