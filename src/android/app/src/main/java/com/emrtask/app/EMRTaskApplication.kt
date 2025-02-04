package com.emrtask.app

import android.app.Application
import androidx.work.*
import com.emrtask.app.database.OfflineDatabase
import com.emrtask.app.sync.SyncModule
import com.emrtask.app.notification.NotificationModule
import com.jakewharton.timber.Timber
import com.squareup.leakcanary.LeakCanary
import com.google.android.gms.security.ProviderInstaller
import dagger.hilt.android.HiltAndroidApp
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import timber.log.Timber.DebugTree

private const val TAG = "EMRTaskApplication"
private const val SYNC_INTERVAL_HOURS = 1L
private const val MAX_RETRY_ATTEMPTS = 3
private const val ENCRYPTION_KEY_ROTATION_DAYS = 30

/**
 * Main application class for EMR Task Android application.
 * Implements HIPAA-compliant security, offline-first capabilities,
 * and CRDT-based synchronization.
 *
 * External library versions:
 * - dagger.hilt.android:hilt-android:2.44
 * - androidx.work:work-runtime-ktx:2.8.0
 * - com.jakewharton.timber:timber:5.0.1
 * - com.squareup.leakcanary:leakcanary-android:2.10
 * - com.google.android.gms:play-services-security:20.5.0
 */
@HiltAndroidApp
class EMRTaskApplication : Application() {

    @Inject
    lateinit var database: OfflineDatabase

    @Inject
    lateinit var syncModule: SyncModule

    @Inject
    lateinit var notificationService: NotificationModule

    private lateinit var workManager: WorkManager

    override fun onCreate() {
        super.onCreate()

        // Initialize security components
        initializeSecurity()

        // Initialize logging with crash reporting
        initializeLogging()

        // Initialize core components
        initializeComponents()

        // Setup background work
        setupBackgroundWork()

        // Initialize performance monitoring
        initializePerformanceMonitoring()
    }

    private fun initializeSecurity() {
        try {
            // Update security provider to prevent SSL/TLS vulnerabilities
            ProviderInstaller.installIfNeeded(applicationContext)

            // Initialize encryption for offline database
            database.initializeEncryption(
                keyRotationDays = ENCRYPTION_KEY_ROTATION_DAYS,
                requireHardwareBackedKeys = true
            )

            // Configure HIPAA-compliant notifications
            notificationService.configureHIPAACompliance(
                enableEncryption = true,
                enableAuditLogging = true
            )
        } catch (e: Exception) {
            Timber.e(e, "Security initialization failed")
            throw SecurityException("Failed to initialize security components", e)
        }
    }

    private fun initializeLogging() {
        if (BuildConfig.DEBUG) {
            Timber.plant(DebugTree())
        } else {
            Timber.plant(CrashReportingTree())
        }
    }

    private fun initializeComponents() {
        // Initialize WorkManager with custom configuration
        val workManagerConfig = Configuration.Builder()
            .setMinimumLoggingLevel(android.util.Log.INFO)
            .setWorkerFactory(EMRWorkerFactory())
            .build()
        WorkManager.initialize(this, workManagerConfig)
        workManager = WorkManager.getInstance(this)

        // Initialize CRDT-based sync
        syncModule.initializeCRDT(
            nodeId = getDeviceId(),
            maxRetryAttempts = MAX_RETRY_ATTEMPTS
        )

        // Initialize debug tools in debug builds
        if (BuildConfig.DEBUG) {
            initializeDebugTools()
        }
    }

    private fun setupBackgroundWork() {
        // Configure periodic sync work
        val syncWorkRequest = PeriodicWorkRequestBuilder<SyncWorker>(
            SYNC_INTERVAL_HOURS, TimeUnit.HOURS
        )
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .setRequiresBatteryNotLow(true)
                    .build()
            )
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                WorkRequest.MIN_BACKOFF_MILLIS,
                TimeUnit.MILLISECONDS
            )
            .build()

        // Enqueue sync work with unique name
        workManager.enqueueUniquePeriodicWork(
            "emr_sync_work",
            ExistingPeriodicWorkPolicy.KEEP,
            syncWorkRequest
        )
    }

    private fun initializePerformanceMonitoring() {
        // Configure performance monitoring thresholds
        val performanceConfig = PerformanceMonitoringConfig.Builder()
            .setSlowOperationThreshold(500L) // 500ms
            .setMemoryWarningThreshold(0.85f) // 85% memory usage
            .setDiskSpaceWarningThreshold(0.90f) // 90% disk usage
            .build()

        PerformanceMonitor.initialize(this, performanceConfig)
    }

    private fun initializeDebugTools() {
        // Initialize LeakCanary for memory leak detection
        if (!LeakCanary.isInAnalyzerProcess(this)) {
            LeakCanary.install(this)
        }
    }

    override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
        super.onConfigurationChanged(newConfig)
        
        // Update component configurations
        syncModule.updateConfiguration(newConfig)
        notificationService.updateConfiguration(newConfig)
        
        // Verify security status after configuration change
        validateSecurityStatus()
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        
        when (level) {
            TRIM_MEMORY_RUNNING_CRITICAL,
            TRIM_MEMORY_COMPLETE -> {
                // Clear non-essential caches
                database.clearMemoryCache()
                syncModule.clearNonEssentialData()
                System.gc()
            }
            TRIM_MEMORY_RUNNING_LOW -> {
                // Reduce memory usage
                database.reduceCacheSize()
            }
        }

        // Log memory pressure
        Timber.i("Memory trim level: $level")
    }

    private fun validateSecurityStatus() {
        try {
            // Verify encryption status
            database.verifyEncryption()
            
            // Verify security provider
            ProviderInstaller.installIfNeeded(applicationContext)
            
            // Verify HIPAA compliance
            notificationService.verifyHIPAACompliance()
        } catch (e: Exception) {
            Timber.e(e, "Security validation failed")
            throw SecurityException("Security validation failed", e)
        }
    }

    private class CrashReportingTree : Timber.Tree() {
        override fun log(priority: Int, tag: String?, message: String, t: Throwable?) {
            if (priority == android.util.Log.ERROR) {
                t?.let {
                    // Send crash report to monitoring service
                    CrashReporter.logException(it)
                }
            }
        }
    }
}