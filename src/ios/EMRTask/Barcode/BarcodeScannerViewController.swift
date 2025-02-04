// UIKit - Version: iOS 14.0+
import UIKit
// AVFoundation - Version: iOS 14.0+
import AVFoundation

/// A HIPAA-compliant view controller that manages barcode scanning for EMR task verification
/// with medical environment optimizations and accessibility support.
class BarcodeScannerViewController: UIViewController {
    
    // MARK: - Properties
    
    private let cameraManager: BarcodeCameraManager
    private let overlayView: BarcodeOverlayView
    private let onBarcodeDetected: ((String) -> Void)?
    private var isScanning = false
    
    private let verificationQueue = DispatchQueue(label: "com.emrtask.barcode.verification",
                                                qos: .userInitiated)
    
    // MARK: - Initialization
    
    /// Initializes the scanner with a barcode detection handler
    /// - Parameter barcodeHandler: Callback for processing detected barcodes
    init(barcodeHandler: ((String) -> Void)?) {
        self.onBarcodeDetected = barcodeHandler
        self.cameraManager = BarcodeCameraManager(barcodeHandler: { [weak self] code in
            self?.handleBarcodeDetection(code)
        })
        self.overlayView = BarcodeOverlayView(frame: .zero)
        
        super.init(nibName: nil, bundle: nil)
        
        modalPresentationStyle = .fullScreen
        modalTransitionStyle = .crossDissolve
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    // MARK: - Lifecycle Methods
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        setupUI()
        configureCameraManager()
        configureAccessibility()
        setupGestureRecognizers()
        
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAppStateChange),
            name: UIApplication.willResignActiveNotification,
            object: nil
        )
    }
    
    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        
        startScanning()
    }
    
    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        
        stopScanning()
    }
    
    // MARK: - Setup Methods
    
    private func setupUI() {
        view.backgroundColor = .black
        
        // Add and configure overlay view
        view.addSubview(overlayView)
        overlayView.translatesAutoresizingMaskIntoConstraints = false
        
        NSLayoutConstraint.activate([
            overlayView.topAnchor.constraint(equalTo: view.topAnchor),
            overlayView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            overlayView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            overlayView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }
    
    private func configureCameraManager() {
        switch cameraManager.setupCaptureSession() {
        case .success:
            let previewResult = cameraManager.configurePreviewLayer(in: view)
            if case .failure(let error) = previewResult {
                handleError(error)
            }
        case .failure(let error):
            handleError(error)
        }
    }
    
    private func configureAccessibility() {
        view.accessibilityViewIsModal = true
        
        // Voice over guidance
        UIAccessibility.post(
            notification: .announcement,
            argument: NSLocalizedString(
                "Barcode scanner activated. Position barcode within frame.",
                comment: "Scanner activation announcement"
            )
        )
    }
    
    private func setupGestureRecognizers() {
        let doubleTapGesture = UITapGestureRecognizer(
            target: self,
            action: #selector(handleDoubleTap)
        )
        doubleTapGesture.numberOfTapsRequired = 2
        view.addGestureRecognizer(doubleTapGesture)
    }
    
    // MARK: - Scanning Control
    
    private func startScanning() {
        guard !isScanning else { return }
        
        switch cameraManager.startScanning() {
        case .success:
            isScanning = true
            overlayView.startScanAnimation()
            overlayView.updateScanStatus(
                message: NSLocalizedString("Ready to scan", comment: "Scanner ready state"),
                isSuccess: true
            )
        case .failure(let error):
            handleError(error)
        }
    }
    
    private func stopScanning() {
        guard isScanning else { return }
        
        cameraManager.stopScanning()
        isScanning = false
        overlayView.stopScanAnimation()
    }
    
    // MARK: - Barcode Processing
    
    private func handleBarcodeDetection(_ barcodeValue: String) {
        // Prevent multiple rapid scans
        guard isScanning else { return }
        
        // Temporarily pause scanning
        isScanning = false
        
        verificationQueue.async { [weak self] in
            guard let self = self else { return }
            
            // Validate barcode format
            guard self.validateBarcodeFormat(barcodeValue) else {
                DispatchQueue.main.async {
                    self.handleInvalidBarcode()
                }
                return
            }
            
            // Process the barcode
            DispatchQueue.main.async {
                self.overlayView.updateScanStatus(
                    message: NSLocalizedString("Verifying...", comment: "Verification in progress"),
                    isSuccess: true
                )
                
                // Call the handler with the verified barcode
                self.onBarcodeDetected?(barcodeValue)
                
                // Resume scanning after a delay
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                    self.isScanning = true
                }
            }
        }
    }
    
    private func validateBarcodeFormat(_ barcode: String) -> Bool {
        // Implement specific medical barcode format validation
        // Example: GS1 or HIBC format validation
        return barcode.count >= 8 && barcode.count <= 64
    }
    
    private func handleInvalidBarcode() {
        overlayView.updateScanStatus(
            message: NSLocalizedString("Invalid barcode format", comment: "Invalid barcode"),
            isSuccess: false
        )
        
        // Resume scanning after error display
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            self.isScanning = true
        }
    }
    
    // MARK: - Error Handling
    
    private func handleError(_ error: Error) {
        let errorMessage = NSLocalizedString(
            "Scanner error: \(error.localizedDescription)",
            comment: "Scanner error message"
        )
        
        overlayView.updateScanStatus(message: errorMessage, isSuccess: false)
        
        // Log error for monitoring
        NSLog("EMRTask Scanner Error: \(error)")
    }
    
    // MARK: - Action Handlers
    
    @objc private func handleDoubleTap() {
        switch cameraManager.toggleTorch() {
        case .success(let isOn):
            let message = isOn ? "Torch enabled" : "Torch disabled"
            overlayView.updateScanStatus(
                message: NSLocalizedString(message, comment: "Torch state"),
                isSuccess: true
            )
        case .failure(let error):
            handleError(error)
        }
    }
    
    @objc private func handleAppStateChange() {
        stopScanning()
    }
    
    // MARK: - Public Methods
    
    /// Safely dismisses the scanner view controller
    func dismissScanner() {
        stopScanning()
        dismiss(animated: true)
    }
}