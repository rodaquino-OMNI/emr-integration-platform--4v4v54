import XCTest

// iOS 14.0+ required for modern XCTest features
@available(iOS 14.0, *)
class EMRTaskUITests: XCTestCase {
    
    // MARK: - Properties
    private var app: XCUIApplication!
    
    // Test constants
    private let TEST_USERNAME = "test.nurse@hospital.com"
    private let TEST_PASSWORD = "test123!"
    private let TASK_TIMEOUT: TimeInterval = 10
    private let NETWORK_TIMEOUT: TimeInterval = 30
    private let ANIMATION_TIMEOUT: TimeInterval = 2
    
    // MARK: - Setup and Teardown
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["UI-TESTING"]
        app.launch()
    }
    
    // MARK: - Helper Functions
    private func waitForElement(_ element: XCUIElement, timeout: TimeInterval) -> Bool {
        let predicate = NSPredicate(format: "exists == true")
        let expectation = expectation(for: predicate, evaluatedWith: element)
        return XCTWaiter().wait(for: [expectation], timeout: timeout) == .completed
    }
    
    private func simulateOfflineMode() {
        let settingsApp = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
        settingsApp.launch()
        
        // Enable Airplane Mode
        settingsApp.tables.cells["Airplane Mode"].tap()
        app.activate()
        
        // Wait for offline indicator
        XCTAssertTrue(waitForElement(app.staticTexts["Offline Mode"], timeout: NETWORK_TIMEOUT))
    }
    
    // MARK: - Authentication Tests
    func testLoginFlow() throws {
        // Test standard login
        let emailField = app.textFields["Email"]
        let passwordField = app.secureTextFields["Password"]
        let loginButton = app.buttons["Login"]
        
        XCTAssertTrue(waitForElement(emailField, timeout: TASK_TIMEOUT))
        emailField.tap()
        emailField.typeText(TEST_USERNAME)
        
        passwordField.tap()
        passwordField.typeText(TEST_PASSWORD)
        
        loginButton.tap()
        
        // Verify successful login
        XCTAssertTrue(waitForElement(app.navigationBars["Task Board"], timeout: TASK_TIMEOUT))
        
        // Test biometric authentication
        app.terminate()
        app.launch()
        
        let biometricButton = app.buttons["Use Face ID"]
        XCTAssertTrue(waitForElement(biometricButton, timeout: TASK_TIMEOUT))
        biometricButton.tap()
        
        // Simulate biometric success
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let biometricDialog = springboard.alerts.element
        biometricDialog.buttons["Authenticate"].tap()
        
        // Verify successful biometric login
        XCTAssertTrue(waitForElement(app.navigationBars["Task Board"], timeout: TASK_TIMEOUT))
    }
    
    // MARK: - Task Board Tests
    func testTaskBoardNavigation() throws {
        // Login first
        try testLoginFlow()
        
        // Verify column layout
        let todoColumn = app.otherElements["ToDo Column"]
        let inProgressColumn = app.otherElements["InProgress Column"]
        let completedColumn = app.otherElements["Completed Column"]
        
        XCTAssertTrue(waitForElement(todoColumn, timeout: TASK_TIMEOUT))
        XCTAssertTrue(waitForElement(inProgressColumn, timeout: TASK_TIMEOUT))
        XCTAssertTrue(waitForElement(completedColumn, timeout: TASK_TIMEOUT))
        
        // Test drag and drop
        let firstTask = todoColumn.cells.element(boundBy: 0)
        let dropTarget = inProgressColumn
        
        firstTask.press(forDuration: 0.5, thenDragTo: dropTarget)
        
        // Verify task moved
        XCTAssertEqual(inProgressColumn.cells.count, 1)
        XCTAssertTrue(waitForElement(app.staticTexts["Task moved to In Progress"], timeout: ANIMATION_TIMEOUT))
    }
    
    // MARK: - Handover Tests
    func testShiftHandover() throws {
        // Login first
        try testLoginFlow()
        
        // Navigate to handover
        app.tabBars.buttons["Handover"].tap()
        
        // Verify handover screen elements
        let handoverTitle = app.navigationBars["Shift Handover"]
        let taskList = app.tables["Pending Tasks"]
        let transferButton = app.buttons["Begin Transfer"]
        
        XCTAssertTrue(waitForElement(handoverTitle, timeout: TASK_TIMEOUT))
        XCTAssertTrue(waitForElement(taskList, timeout: TASK_TIMEOUT))
        XCTAssertTrue(waitForElement(transferButton, timeout: TASK_TIMEOUT))
        
        // Test handover process
        transferButton.tap()
        
        // Verify confirmation dialog
        let confirmDialog = app.alerts["Confirm Handover"]
        XCTAssertTrue(waitForElement(confirmDialog, timeout: TASK_TIMEOUT))
        
        confirmDialog.buttons["Confirm"].tap()
        
        // Verify successful handover
        XCTAssertTrue(waitForElement(app.staticTexts["Handover Complete"], timeout: NETWORK_TIMEOUT))
    }
    
    // MARK: - Barcode Scanner Tests
    func testBarcodeScanner() throws {
        // Login first
        try testLoginFlow()
        
        // Navigate to task detail
        let firstTask = app.cells["Task Cell"].firstMatch
        XCTAssertTrue(waitForElement(firstTask, timeout: TASK_TIMEOUT))
        firstTask.tap()
        
        // Verify scanner button
        let scanButton = app.buttons["Scan Barcode"]
        XCTAssertTrue(waitForElement(scanButton, timeout: TASK_TIMEOUT))
        scanButton.tap()
        
        // Verify camera access alert
        let cameraAlert = app.alerts["Camera Access Required"]
        XCTAssertTrue(waitForElement(cameraAlert, timeout: TASK_TIMEOUT))
        cameraAlert.buttons["Allow"].tap()
        
        // Verify scanner view
        XCTAssertTrue(waitForElement(app.otherElements["Scanner View"], timeout: TASK_TIMEOUT))
        
        // Simulate successful scan
        NotificationCenter.default.post(name: NSNotification.Name("TestBarcodeScanned"), 
                                     object: nil, 
                                     userInfo: ["barcode": "TEST-123"])
        
        // Verify scan result
        XCTAssertTrue(waitForElement(app.staticTexts["Barcode Verified"], timeout: NETWORK_TIMEOUT))
    }
    
    // MARK: - Offline Mode Tests
    func testOfflineFunctionality() throws {
        // Login first
        try testLoginFlow()
        
        // Enable offline mode
        simulateOfflineMode()
        
        // Verify offline indicator
        XCTAssertTrue(waitForElement(app.staticTexts["Offline Mode"], timeout: ANIMATION_TIMEOUT))
        
        // Test task creation in offline mode
        app.buttons["New Task"].tap()
        
        let taskTitle = app.textFields["Task Title"]
        XCTAssertTrue(waitForElement(taskTitle, timeout: TASK_TIMEOUT))
        taskTitle.typeText("Offline Test Task")
        
        app.buttons["Save"].tap()
        
        // Verify offline queue indicator
        XCTAssertTrue(waitForElement(app.staticTexts["Queued for Sync"], timeout: ANIMATION_TIMEOUT))
    }
    
    // MARK: - Accessibility Tests
    func testAccessibilityCompliance() throws {
        // Login first
        try testLoginFlow()
        
        // Test VoiceOver navigation
        XCUIDevice.shared.press(.home)
        
        // Enable VoiceOver
        let settings = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
        settings.launch()
        
        // Navigate through main elements with VoiceOver
        for element in app.cells.allElementsBoundByIndex {
            XCTAssertNotNil(element.value)
            XCTAssertNotNil(element.label)
        }
        
        // Verify dynamic type support
        let currentContentSize = app.staticTexts.element(boundBy: 0).frame.size
        
        // Change text size
        settings.tables.cells["Display & Brightness"].tap()
        settings.tables.cells["Text Size"].tap()
        
        let slider = settings.sliders.element(boundBy: 0)
        slider.adjust(toNormalizedSliderPosition: 0.8)
        
        app.activate()
        
        // Verify text size changed
        let newContentSize = app.staticTexts.element(boundBy: 0).frame.size
        XCTAssertNotEqual(currentContentSize, newContentSize)
    }
}