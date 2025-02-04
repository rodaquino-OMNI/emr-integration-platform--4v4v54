// AVFoundation - Version: iOS 14.0+
import AVFoundation
// UIKit - Version: iOS 14.0+
import UIKit

/// A comprehensive camera manager that provides secure, efficient, and reliable barcode scanning
/// capabilities for EMR task verification, with support for multiple barcode formats.
class BarcodeCameraManager: NSObject {
    
    // MARK: - Properties
    
    private let captureSession = AVCaptureSession()
    private var captureDevice: AVCaptureDevice?
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private let metadataOutput = AVCaptureMetadataOutput()
    private let sessionQueue = DispatchQueue(label: "com.emrtask.camera.session")
    private var onBarcodeDetected: ((String) -> Void)?
    
    private(set) var isTorchAvailable = false
    private(set) var isTorchActive = false
    private(set) var isSessionRunning = false
    private(set) var setupError: NSError?
    
    // MARK: - Initialization
    
    /// Initializes the camera manager with a barcode detection callback
    /// - Parameter barcodeHandler: Optional callback for handling detected barcodes
    init(barcodeHandler: ((String) -> Void)? = nil) {
        super.init()
        self.onBarcodeDetected = barcodeHandler
        self.captureSession.sessionPreset = .high
    }
    
    // MARK: - Session Configuration
    
    /// Configures the capture session with input and output devices
    /// - Returns: Result indicating success or failure with error details
    func setupCaptureSession() -> Result<Void, Error> {
        var setupResult: Result<Void, Error> = .success(())
        
        sessionQueue.async { [weak self] in
            guard let self = self else { return }
            
            // Check camera permissions
            let authStatus = AVCaptureDevice.authorizationStatus(for: .video)
            if authStatus != .authorized {
                setupResult = .failure(NSError(domain: "EMRTask.Camera",
                                            code: 1001,
                                            userInfo: [NSLocalizedDescriptionKey: "Camera access not authorized"]))
                return
            }
            
            self.captureSession.beginConfiguration()
            
            // Configure camera input
            guard let videoDevice = AVCaptureDevice.default(.builtInWideAngleCamera,
                                                          for: .video,
                                                          position: .back) else {
                setupResult = .failure(NSError(domain: "EMRTask.Camera",
                                            code: 1002,
                                            userInfo: [NSLocalizedDescriptionKey: "Camera device not available"]))
                return
            }
            
            do {
                let videoInput = try AVCaptureDeviceInput(device: videoDevice)
                if self.captureSession.canAddInput(videoInput) {
                    self.captureSession.addInput(videoInput)
                    self.captureDevice = videoDevice
                    self.isTorchAvailable = videoDevice.hasTorch
                }
            } catch {
                setupResult = .failure(error)
                return
            }
            
            // Configure metadata output
            if self.captureSession.canAddOutput(self.metadataOutput) {
                self.captureSession.addOutput(self.metadataOutput)
                self.metadataOutput.metadataObjectTypes = [
                    .qr,
                    .code128,
                    .code39,
                    .dataMatrix
                ]
                self.metadataOutput.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)
            }
            
            self.captureSession.commitConfiguration()
        }
        
        return setupResult
    }
    
    // MARK: - Scanning Control
    
    /// Starts the barcode scanning session
    /// - Returns: Result indicating success or failure
    func startScanning() -> Result<Void, Error> {
        var startResult: Result<Void, Error> = .success(())
        
        sessionQueue.async { [weak self] in
            guard let self = self else { return }
            
            if !self.captureSession.isRunning {
                self.captureSession.startRunning()
                DispatchQueue.main.async {
                    self.isSessionRunning = true
                }
            } else {
                startResult = .failure(NSError(domain: "EMRTask.Camera",
                                            code: 1003,
                                            userInfo: [NSLocalizedDescriptionKey: "Session already running"]))
            }
        }
        
        return startResult
    }
    
    /// Safely stops the scanning session and cleans up resources
    func stopScanning() {
        sessionQueue.async { [weak self] in
            guard let self = self else { return }
            
            if self.captureSession.isRunning {
                self.captureSession.stopRunning()
                DispatchQueue.main.async {
                    self.isSessionRunning = false
                    self.previewLayer?.removeFromSuperlayer()
                    self.previewLayer = nil
                }
            }
        }
    }
    
    // MARK: - Torch Control
    
    /// Thread-safe torch control with device capability checking
    /// - Returns: Result with new torch state or error
    func toggleTorch() -> Result<Bool, Error> {
        guard let device = captureDevice, isTorchAvailable else {
            return .failure(NSError(domain: "EMRTask.Camera",
                                  code: 1004,
                                  userInfo: [NSLocalizedDescriptionKey: "Torch not available"]))
        }
        
        do {
            try device.lockForConfiguration()
            device.torchMode = device.torchMode == .on ? .off : .on
            device.unlockForConfiguration()
            
            isTorchActive = device.torchMode == .on
            return .success(isTorchActive)
        } catch {
            return .failure(error)
        }
    }
    
    // MARK: - Preview Layer Configuration
    
    /// Sets up and configures the camera preview layer
    /// - Parameter view: The view to add the preview layer to
    /// - Returns: Result indicating success or failure
    func configurePreviewLayer(in view: UIView) -> Result<Void, Error> {
        sessionQueue.async { [weak self] in
            guard let self = self else { return }
            
            let videoPreviewLayer = AVCaptureVideoPreviewLayer(session: self.captureSession)
            videoPreviewLayer.frame = view.bounds
            videoPreviewLayer.videoGravity = .resizeAspectFill
            
            DispatchQueue.main.async {
                view.layer.addSublayer(videoPreviewLayer)
                self.previewLayer = videoPreviewLayer
                
                // Handle orientation changes
                NotificationCenter.default.addObserver(
                    self,
                    selector: #selector(self.updatePreviewOrientation),
                    name: UIDevice.orientationDidChangeNotification,
                    object: nil
                )
            }
        }
        
        return .success(())
    }
    
    // MARK: - Private Methods
    
    @objc private func updatePreviewOrientation() {
        guard let connection = previewLayer?.connection else { return }
        
        let currentDevice = UIDevice.current
        let orientation = currentDevice.orientation
        let previewLayerConnection = connection
        
        if previewLayerConnection.isVideoOrientationSupported {
            switch orientation {
            case .portrait:
                previewLayerConnection.videoOrientation = .portrait
            case .landscapeRight:
                previewLayerConnection.videoOrientation = .landscapeLeft
            case .landscapeLeft:
                previewLayerConnection.videoOrientation = .landscapeRight
            case .portraitUpsideDown:
                previewLayerConnection.videoOrientation = .portraitUpsideDown
            default:
                previewLayerConnection.videoOrientation = .portrait
            }
        }
    }
}

// MARK: - AVCaptureMetadataOutputObjectsDelegate

extension BarcodeCameraManager: AVCaptureMetadataOutputObjectsDelegate {
    
    func metadataOutput(_ output: AVCaptureMetadataOutput,
                       didOutput metadataObjects: [AVMetadataObject],
                       from connection: AVCaptureConnection) {
        
        guard let metadataObject = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              let barcodeValue = metadataObject.stringValue else {
            return
        }
        
        // Provide haptic feedback
        let feedbackGenerator = UINotificationFeedbackGenerator()
        feedbackGenerator.notificationOccurred(.success)
        
        // Call handler on main queue
        DispatchQueue.main.async { [weak self] in
            self?.onBarcodeDetected?(barcodeValue)
        }
    }
}