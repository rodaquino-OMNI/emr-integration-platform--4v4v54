// Network - iOS 14.0+
import Network
// Foundation - iOS 14.0+
import Foundation
// Combine - iOS 14.0+
import Combine

/// Notification posted when network state changes
public let NETWORK_STATE_CHANGED_NOTIFICATION = Notification.Name("com.emrtask.networkStateChanged")
/// Notification posted when network quality changes
public let NETWORK_QUALITY_CHANGED_NOTIFICATION = Notification.Name("com.emrtask.networkQualityChanged")

/// Represents different types of network connections
@objc public enum ConnectionType: Int {
    case none
    case wifi
    case cellular
    case ethernet
    case loopback
    case other
    
    var description: String {
        switch self {
        case .none: return "No Connection"
        case .wifi: return "WiFi"
        case .cellular: return "Cellular"
        case .ethernet: return "Ethernet"
        case .loopback: return "Loopback"
        case .other: return "Other"
        }
    }
}

/// Represents network connection quality levels
@objc public enum ConnectionQuality: Int {
    case unknown
    case poor
    case fair
    case good
    case excellent
}

/// Network monitoring errors
private enum NetworkError: Error {
    case monitoringFailed
    case invalidInterface
    case qualityMeasurementFailed
}

/// Thread-safe singleton class for monitoring network connectivity
@available(iOS 14.0, *)
@objc public final class NetworkMonitor: NSObject {
    
    // MARK: - Properties
    
    /// Shared instance for singleton access
    public static let shared = NetworkMonitor()
    
    /// Network path monitor instance
    private let monitor: NWPathMonitor
    
    /// Dedicated dispatch queue for network monitoring
    private let queue: DispatchQueue
    
    /// Set of cancellable subscribers
    private var cancellables = Set<AnyCancellable>()
    
    /// Published connection status
    @Published private(set) public var isConnected: Bool = false
    
    /// Published connection type
    @Published private(set) public var connectionType: ConnectionType = .none
    
    /// Published connection quality
    @Published private(set) public var connectionQuality: ConnectionQuality = .unknown
    
    /// Timer for debouncing state updates
    private var stateUpdateDebouncer: Timer?
    
    /// Last encountered error
    private var lastError: NetworkError?
    
    // MARK: - Initialization
    
    private override init() {
        self.monitor = NWPathMonitor()
        self.queue = DispatchQueue(label: "com.emrtask.networkmonitor",
                                 qos: .utility,
                                 attributes: .concurrent)
        
        super.init()
        
        setupMonitor()
    }
    
    // MARK: - Public Methods
    
    /// Starts monitoring network state changes
    public func startMonitoring() {
        monitor.start(queue: queue)
    }
    
    /// Stops monitoring network state changes
    public func stopMonitoring() {
        monitor.cancel()
        stateUpdateDebouncer?.invalidate()
        cancellables.removeAll()
        
        queue.async { [weak self] in
            self?.isConnected = false
            self?.connectionType = .none
            self?.connectionQuality = .unknown
        }
    }
    
    // MARK: - Private Methods
    
    private func setupMonitor() {
        monitor.pathUpdateHandler = { [weak self] path in
            self?.handlePathUpdate(path)
        }
        
        // Configure power-efficient monitoring
        monitor.start(queue: queue)
    }
    
    private func handlePathUpdate(_ path: NWPath) {
        // Debounce rapid state changes
        stateUpdateDebouncer?.invalidate()
        stateUpdateDebouncer = Timer.scheduledTimer(withTimeInterval: APIConstants.retryInterval, repeats: false) { [weak self] _ in
            self?.updateConnectionStatus(path)
        }
    }
    
    private func updateConnectionStatus(_ path: NWPath) {
        queue.async { [weak self] in
            guard let self = self else { return }
            
            // Update connection status
            self.isConnected = path.status == .satisfied
            
            // Determine connection type
            let newConnectionType: ConnectionType = {
                if path.usesInterfaceType(.wifi) { return .wifi }
                if path.usesInterfaceType(.cellular) { return .cellular }
                if path.usesInterfaceType(.wiredEthernet) { return .ethernet }
                if path.usesInterfaceType(.loopback) { return .loopback }
                return self.isConnected ? .other : .none
            }()
            
            // Update connection type if changed
            if self.connectionType != newConnectionType {
                self.connectionType = newConnectionType
            }
            
            // Determine connection quality
            let newQuality: ConnectionQuality = {
                guard self.isConnected else { return .unknown }
                
                switch path.quality {
                case .poor: return .poor
                case .good: return .good
                case .excellent: return .excellent
                default: return .fair
                }
            }()
            
            // Update connection quality if changed
            if self.connectionQuality != newQuality {
                self.connectionQuality = newQuality
            }
            
            // Post notifications
            self.postStateChangeNotification()
            self.postQualityChangeNotification()
        }
    }
    
    private func postStateChangeNotification() {
        let userInfo: [String: Any] = [
            "isConnected": isConnected,
            "connectionType": connectionType,
            "timestamp": Date()
        ]
        
        NotificationCenter.default.post(name: NETWORK_STATE_CHANGED_NOTIFICATION,
                                     object: self,
                                     userInfo: userInfo)
    }
    
    private func postQualityChangeNotification() {
        let userInfo: [String: Any] = [
            "quality": connectionQuality,
            "timestamp": Date()
        ]
        
        NotificationCenter.default.post(name: NETWORK_QUALITY_CHANGED_NOTIFICATION,
                                     object: self,
                                     userInfo: userInfo)
    }
}

// MARK: - ObservableObject Conformance
@available(iOS 14.0, *)
extension NetworkMonitor: ObservableObject {
    /// Publisher for connection status changes
    public var connectionStatusPublisher: AnyPublisher<Bool, Never> {
        $isConnected.eraseToAnyPublisher()
    }
    
    /// Publisher for connection type changes
    public var connectionTypePublisher: AnyPublisher<ConnectionType, Never> {
        $connectionType.eraseToAnyPublisher()
    }
    
    /// Publisher for connection quality changes
    public var connectionQualityPublisher: AnyPublisher<ConnectionQuality, Never> {
        $connectionQuality.eraseToAnyPublisher()
    }
}