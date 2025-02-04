// Foundation - iOS 14.0+
import Foundation
// os.log - iOS 14.0+
import os.log

/// Subsystem identifier for logging
private let LogSubsystem = "com.emrtask.logger"
/// Default logging category
private let LogCategory = "default"

/// Thread-safe logging utility providing structured logging with comprehensive monitoring
/// and compliance features for the EMR Task iOS application
@available(iOS 14.0, *)
public final class Logger {
    
    // MARK: - Singleton
    
    /// Shared instance of the logger
    public static let shared = Logger()
    
    // MARK: - Properties
    
    /// System logger instance
    private let logger: OSLog
    
    /// Date formatter for log timestamps
    private let dateFormatter: DateFormatter
    
    /// Debug mode flag
    private let isDebugEnabled: Bool
    
    /// File handle for persistent logging
    private var fileHandle: FileHandle?
    
    /// Serial queue for thread-safe logging
    private let loggingQueue: DispatchQueue
    
    /// Log entry buffer for batch processing
    private var buffer: [String]
    
    /// Maximum buffer size before flush
    private let maxBufferSize = 100
    
    /// Maximum log file size in bytes (50MB)
    private let maxLogFileSize: UInt64 = 50_000_000
    
    /// Log retention period in days
    private let logRetentionDays = 30
    
    // MARK: - Initialization
    
    private init() {
        // Initialize system logger
        self.logger = OSLog(subsystem: LogSubsystem, category: LogCategory)
        
        // Configure date formatter
        self.dateFormatter = DateFormatter()
        self.dateFormatter.dateFormat = "yyyy-MM-dd HH:mm:ss.SSS"
        self.dateFormatter.timeZone = TimeZone.current
        
        // Initialize logging queue
        self.loggingQueue = DispatchQueue(label: "\(LogSubsystem).queue",
                                        qos: .utility)
        
        // Initialize buffer
        self.buffer = []
        
        // Set debug mode based on build configuration
        #if DEBUG
        self.isDebugEnabled = true
        #else
        self.isDebugEnabled = false
        #endif
        
        // Set up log file
        setupLogFile()
        
        // Start log rotation timer
        setupLogRotation()
    }
    
    // MARK: - Private Methods
    
    private func setupLogFile() {
        let fileManager = FileManager.default
        guard let documentsPath = fileManager.urls(for: .documentDirectory,
                                                 in: .userDomainMask).first else {
            return
        }
        
        let logFileURL = documentsPath.appendingPathComponent("emrtask.log")
        
        if !fileManager.fileExists(atPath: logFileURL.path) {
            fileManager.createFile(atPath: logFileURL.path,
                                 contents: nil,
                                 attributes: [.protectionKey: FileProtectionType.complete])
        }
        
        do {
            self.fileHandle = try FileHandle(forWritingTo: logFileURL)
            try self.fileHandle?.seekToEnd()
        } catch {
            os_log("Failed to setup log file: %{public}@",
                   log: logger,
                   type: .error,
                   error.localizedDescription)
        }
    }
    
    private func setupLogRotation() {
        Timer.scheduledTimer(withTimeInterval: 86400, repeats: true) { [weak self] _ in
            self?.rotateLogFileIfNeeded()
        }
    }
    
    private func rotateLogFileIfNeeded() {
        guard let fileHandle = fileHandle else { return }
        
        do {
            let fileSize = try fileHandle.seekToEnd()
            if fileSize >= maxLogFileSize {
                try archiveCurrentLog()
                try resetLogFile()
                cleanupOldLogs()
            }
        } catch {
            os_log("Log rotation failed: %{public}@",
                   log: logger,
                   type: .error,
                   error.localizedDescription)
        }
    }
    
    private func archiveCurrentLog() throws {
        guard let fileHandle = fileHandle else { return }
        
        fileHandle.closeFile()
        
        let fileManager = FileManager.default
        guard let documentsPath = fileManager.urls(for: .documentDirectory,
                                                 in: .userDomainMask).first else {
            return
        }
        
        let currentLogPath = documentsPath.appendingPathComponent("emrtask.log")
        let archivePath = documentsPath.appendingPathComponent("emrtask-\(Date().timeIntervalSince1970).log")
        
        try fileManager.moveItem(at: currentLogPath, to: archivePath)
    }
    
    private func resetLogFile() throws {
        setupLogFile()
    }
    
    private func cleanupOldLogs() {
        let fileManager = FileManager.default
        guard let documentsPath = fileManager.urls(for: .documentDirectory,
                                                 in: .userDomainMask).first else {
            return
        }
        
        let cutoffDate = Date().addingTimeInterval(-Double(logRetentionDays * 86400))
        
        do {
            let logFiles = try fileManager.contentsOfDirectory(at: documentsPath,
                                                             includingPropertiesForKeys: [.creationDateKey],
                                                             options: .skipsHiddenFiles)
            
            for fileURL in logFiles where fileURL.lastPathComponent.hasPrefix("emrtask-") {
                if let attributes = try? fileManager.attributesOfItem(atPath: fileURL.path),
                   let creationDate = attributes[.creationDate] as? Date,
                   creationDate < cutoffDate {
                    try? fileManager.removeItem(at: fileURL)
                }
            }
        } catch {
            os_log("Log cleanup failed: %{public}@",
                   log: logger,
                   type: .error,
                   error.localizedDescription)
        }
    }
    
    private func formatLogMessage(_ message: String,
                                level: OSLogType,
                                file: String,
                                line: Int,
                                function: String) -> String {
        let timestamp = dateFormatter.string(from: Date())
        let fileName = (file as NSString).lastPathComponent
        let levelString = level == .debug ? "DEBUG" :
            level == .error ? "ERROR" :
            level == .info ? "INFO" : "DEFAULT"
        
        return "[\(timestamp)] [\(levelString)] [\(APIConstants.apiVersion)] [\(fileName):\(line)] \(function): \(message)"
    }
    
    private func writeToFile(_ message: String) {
        guard let fileHandle = fileHandle,
              let data = (message + "\n").data(using: .utf8) else { return }
        
        do {
            try fileHandle.write(contentsOf: data)
        } catch {
            os_log("Failed to write to log file: %{public}@",
                   log: logger,
                   type: .error,
                   error.localizedDescription)
        }
    }
    
    // MARK: - Public Methods
    
    /// Logs debug level messages with enhanced context
    /// - Parameters:
    ///   - message: The message to log
    ///   - file: Source file name (auto-filled)
    ///   - line: Source line number (auto-filled)
    ///   - function: Function name (auto-filled)
    public func debug(_ message: String,
                     file: String = #file,
                     line: Int = #line,
                     function: String = #function) {
        guard isDebugEnabled else { return }
        
        let formattedMessage = formatLogMessage(message,
                                              level: .debug,
                                              file: file,
                                              line: line,
                                              function: function)
        
        loggingQueue.async { [weak self] in
            guard let self = self else { return }
            
            os_log("%{public}@",
                   log: self.logger,
                   type: .debug,
                   formattedMessage)
            
            self.buffer.append(formattedMessage)
            
            if self.buffer.count >= self.maxBufferSize {
                let messages = self.buffer
                self.buffer.removeAll()
                
                for message in messages {
                    self.writeToFile(message)
                }
            }
        }
    }
    
    /// Logs error messages with comprehensive error tracking
    /// - Parameters:
    ///   - message: The error message
    ///   - error: Optional Error object
    ///   - file: Source file name (auto-filled)
    ///   - line: Source line number (auto-filled)
    ///   - function: Function name (auto-filled)
    public func error(_ message: String,
                     error: Error? = nil,
                     file: String = #file,
                     line: Int = #line,
                     function: String = #function) {
        var fullMessage = message
        if let error = error {
            fullMessage += " - Error: \(error.localizedDescription)"
        }
        
        let formattedMessage = formatLogMessage(fullMessage,
                                              level: .error,
                                              file: file,
                                              line: line,
                                              function: function)
        
        loggingQueue.async { [weak self] in
            guard let self = self else { return }
            
            os_log("%{public}@",
                   log: self.logger,
                   type: .error,
                   formattedMessage)
            
            // Errors are written immediately
            self.writeToFile(formattedMessage)
        }
    }
}