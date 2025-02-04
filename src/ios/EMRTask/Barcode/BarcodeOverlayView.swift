// UIKit v14.0+
import UIKit

/// A custom UIView that provides an overlay interface for barcode scanning with medical-grade optimizations.
/// Designed for EMR task verification with accessibility support and medical environment considerations.
class BarcodeOverlayView: UIView {
    
    // MARK: - UI Components
    
    private let scanFrame: UIView = {
        let view = UIView()
        view.backgroundColor = .clear
        view.layer.borderWidth = 2.0
        view.layer.borderColor = UIColor.systemBlue.cgColor
        view.accessibilityIdentifier = "scanFrameView"
        return view
    }()
    
    private let statusLabel: UILabel = {
        let label = UILabel()
        label.textAlignment = .center
        label.numberOfLines = 0
        label.font = .preferredFont(forTextStyle: .body)
        label.adjustsFontForContentSizeCategory = true
        label.textColor = .white
        label.backgroundColor = UIColor.black.withAlphaComponent(0.7)
        label.layer.cornerRadius = 8
        label.layer.masksToBounds = true
        label.accessibilityTraits = .updatesFrequently
        return label
    }()
    
    private lazy var cancelButton: UIButton = {
        let button = UIButton(type: .system)
        button.setImage(UIImage(systemName: "xmark.circle.fill"), for: .normal)
        button.tintColor = .white
        button.accessibilityLabel = NSLocalizedString("Cancel Scan", comment: "Cancel barcode scanning")
        button.addTarget(self, action: #selector(cancelButtonTapped), for: .touchUpInside)
        return button
    }()
    
    private lazy var torchButton: UIButton = {
        let button = UIButton(type: .system)
        button.setImage(UIImage(systemName: "flashlight.off.fill"), for: .normal)
        button.tintColor = .white
        button.accessibilityLabel = NSLocalizedString("Toggle Torch", comment: "Toggle flashlight")
        button.addTarget(self, action: #selector(torchButtonTapped), for: .touchUpInside)
        return button
    }()
    
    private let scannerLine: UIView = {
        let view = UIView()
        view.backgroundColor = UIColor.systemBlue.withAlphaComponent(0.5)
        return view
    }()
    
    // MARK: - Corner Views
    
    private let cornerTopLeft = UIView()
    private let cornerTopRight = UIView()
    private let cornerBottomLeft = UIView()
    private let cornerBottomRight = UIView()
    
    // MARK: - Properties
    
    private var scanAnimation: CABasicAnimation?
    private let hapticGenerator = UINotificationFeedbackGenerator()
    
    // MARK: - Initialization
    
    override init(frame: CGRect) {
        super.init(frame: frame)
        setupScanFrame()
        setupStatusLabel()
        setupButtons()
        setupScannerLine()
        setupCornerDecorations()
        configureAccessibility()
        
        hapticGenerator.prepare()
    }
    
    required init?(coder: NSCoder) {
        super.init(coder: coder)
    }
    
    // MARK: - Setup Methods
    
    private func setupScanFrame() {
        addSubview(scanFrame)
        
        scanFrame.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            scanFrame.centerXAnchor.constraint(equalTo: centerXAnchor),
            scanFrame.centerYAnchor.constraint(equalTo: centerYAnchor),
            scanFrame.widthAnchor.constraint(equalTo: widthAnchor, multiplier: 0.8),
            scanFrame.heightAnchor.constraint(equalTo: scanFrame.widthAnchor)
        ])
    }
    
    private func setupStatusLabel() {
        addSubview(statusLabel)
        
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            statusLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 20),
            statusLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -20),
            statusLabel.bottomAnchor.constraint(equalTo: scanFrame.topAnchor, constant: -20),
            statusLabel.heightAnchor.constraint(greaterThanOrEqualToConstant: 44)
        ])
    }
    
    private func setupButtons() {
        addSubview(cancelButton)
        addSubview(torchButton)
        
        cancelButton.translatesAutoresizingMaskIntoConstraints = false
        torchButton.translatesAutoresizingMaskIntoConstraints = false
        
        NSLayoutConstraint.activate([
            cancelButton.topAnchor.constraint(equalTo: safeAreaLayoutGuide.topAnchor, constant: 20),
            cancelButton.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -20),
            cancelButton.widthAnchor.constraint(equalToConstant: 44),
            cancelButton.heightAnchor.constraint(equalToConstant: 44),
            
            torchButton.bottomAnchor.constraint(equalTo: safeAreaLayoutGuide.bottomAnchor, constant: -20),
            torchButton.centerXAnchor.constraint(equalTo: centerXAnchor),
            torchButton.widthAnchor.constraint(equalToConstant: 44),
            torchButton.heightAnchor.constraint(equalToConstant: 44)
        ])
    }
    
    private func setupScannerLine() {
        scanFrame.addSubview(scannerLine)
        
        scannerLine.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            scannerLine.leadingAnchor.constraint(equalTo: scanFrame.leadingAnchor),
            scannerLine.trailingAnchor.constraint(equalTo: scanFrame.trailingAnchor),
            scannerLine.heightAnchor.constraint(equalToConstant: 2)
        ])
    }
    
    private func setupCornerDecorations() {
        [cornerTopLeft, cornerTopRight, cornerBottomLeft, cornerBottomRight].forEach { corner in
            corner.backgroundColor = .systemBlue
            scanFrame.addSubview(corner)
            corner.translatesAutoresizingMaskIntoConstraints = false
        }
        
        let cornerLength: CGFloat = 20
        let cornerThickness: CGFloat = 3
        
        NSLayoutConstraint.activate([
            // Top Left Corner
            cornerTopLeft.leadingAnchor.constraint(equalTo: scanFrame.leadingAnchor),
            cornerTopLeft.topAnchor.constraint(equalTo: scanFrame.topAnchor),
            cornerTopLeft.widthAnchor.constraint(equalToConstant: cornerLength),
            cornerTopLeft.heightAnchor.constraint(equalToConstant: cornerThickness),
            
            // Top Right Corner
            cornerTopRight.trailingAnchor.constraint(equalTo: scanFrame.trailingAnchor),
            cornerTopRight.topAnchor.constraint(equalTo: scanFrame.topAnchor),
            cornerTopRight.widthAnchor.constraint(equalToConstant: cornerLength),
            cornerTopRight.heightAnchor.constraint(equalToConstant: cornerThickness),
            
            // Bottom Left Corner
            cornerBottomLeft.leadingAnchor.constraint(equalTo: scanFrame.leadingAnchor),
            cornerBottomLeft.bottomAnchor.constraint(equalTo: scanFrame.bottomAnchor),
            cornerBottomLeft.widthAnchor.constraint(equalToConstant: cornerLength),
            cornerBottomLeft.heightAnchor.constraint(equalToConstant: cornerThickness),
            
            // Bottom Right Corner
            cornerBottomRight.trailingAnchor.constraint(equalTo: scanFrame.trailingAnchor),
            cornerBottomRight.bottomAnchor.constraint(equalTo: scanFrame.bottomAnchor),
            cornerBottomRight.widthAnchor.constraint(equalToConstant: cornerLength),
            cornerBottomRight.heightAnchor.constraint(equalToConstant: cornerThickness)
        ])
    }
    
    private func configureAccessibility() {
        isAccessibilityElement = false
        scanFrame.isAccessibilityElement = true
        scanFrame.accessibilityLabel = NSLocalizedString("Barcode Scanner Frame", comment: "")
        scanFrame.accessibilityHint = NSLocalizedString("Position barcode within frame to scan", comment: "")
    }
    
    // MARK: - Public Methods
    
    /// Updates the scanning status with appropriate feedback
    /// - Parameters:
    ///   - message: Status message to display
    ///   - isSuccess: Indicates if the scan was successful
    func updateScanStatus(message: String, isSuccess: Bool) {
        statusLabel.text = message
        
        UIView.animate(withDuration: 0.3) {
            self.statusLabel.backgroundColor = isSuccess ?
                UIColor.systemGreen.withAlphaComponent(0.7) :
                UIColor.black.withAlphaComponent(0.7)
        }
        
        hapticGenerator.notificationOccurred(isSuccess ? .success : .warning)
        
        UIAccessibility.post(notification: .announcement, argument: message)
    }
    
    /// Starts the scanner line animation with power optimization
    func startScanAnimation() {
        let animation = CABasicAnimation(keyPath: "position.y")
        animation.fromValue = scannerLine.layer.position.y
        animation.toValue = scanFrame.bounds.height
        animation.duration = 2.0
        animation.repeatCount = .infinity
        animation.autoreverses = true
        animation.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        
        scannerLine.layer.add(animation, forKey: "scanAnimation")
        scanAnimation = animation
    }
    
    /// Stops the scanner line animation safely
    func stopScanAnimation() {
        scannerLine.layer.removeAnimation(forKey: "scanAnimation")
        scanAnimation = nil
    }
    
    // MARK: - Action Methods
    
    @objc private func cancelButtonTapped() {
        hapticGenerator.impactOccurred(intensity: 0.7)
        // Delegate method would be called here
    }
    
    @objc private func torchButtonTapped() {
        hapticGenerator.impactOccurred(intensity: 0.5)
        let newImage = torchButton.currentImage == UIImage(systemName: "flashlight.off.fill") ?
            UIImage(systemName: "flashlight.on.fill") :
            UIImage(systemName: "flashlight.off.fill")
        torchButton.setImage(newImage, for: .normal)
        // Delegate method would be called here
    }
}