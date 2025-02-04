package com.emrtask.app.sync

import android.content.Context
import androidx.work.*
import com.emrtask.app.database.OfflineDatabase
import com.emrtask.app.plugins.EMRPlugin
import com.emrtask.app.security.EncryptionModule
import com.google.crypto.security.SecurityModule
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.*
import timber.log.Timber
import java.time.Duration
import java.time.Instant
import javax.inject.Inject

// External library versions:
// androidx.work:work-runtime-ktx:2.8.0
// org.jetbrains.kotlinx:kotlinx-coroutines-android:1.6.4
// com.jakewharton.timber:timber:5.0.1
// com.google.crypto:security-module:1.2.0

private const val TAG = "SyncWorker"
private const val MAX_RETRIES = 3
private const val SYNC_WORK_NAME = "sync_work"
private const val SECURITY_CONTEXT = "HIPAA_COMPLIANT"
private const val SYNC_BATCH_SIZE = 100
private const val MAX_SYNC_DURATION_MS = 500L

@AndroidEntryPoint
class SyncWorker @Inject constructor(
    @ApplicationContext context: Context,
    workerParams: WorkerParameters,
    private val syncModule: SyncModule,
    private val emrPlugin: EMRPlugin,
    private val database: OfflineDatabase,
    private val securityModule: SecurityModule,
    private val metricsCollector: MetricsCollector
) : CoroutineWorker(context, workerParams) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        try {
            Timber.d("Starting secure background sync")
            metricsCollector.startSync()

            // Validate security context
            val securityContext = securityModule.validateContext(SECURITY_CONTEXT)
            if (!securityContext.isValid()) {
                throw SecurityException("Invalid security context")
            }

            // Check network and EMR availability
            if (!isNetworkAvailable()) {
                Timber.d("Network unavailable, scheduling retry")
                return@withContext handleSyncFailure(
                    NetworkException("Network unavailable"),
                    SyncContext(attempt = runAttemptCount)
                )
            }

            // Perform CRDT-based sync with batching
            var syncResult: SyncResult? = null
            val startTime = Instant.now()

            database.runInTransaction {
                // Get pending changes with encryption
                val pendingChanges = database.taskDao()
                    .getUnsynced(SYNC_BATCH_SIZE)
                    .map { task ->
                        securityModule.encryptTask(task)
                    }

                // Sync with EMR system
                syncResult = emrPlugin.syncEMRData(
                    SecurityContext(
                        userId = securityContext.userId,
                        userRole = securityContext.userRole,
                        accessToken = securityContext.token,
                        expiresAt = Instant.now().plusSeconds(300).epochSecond
                    )
                ).getOrThrow()

                // Validate EMR data accuracy
                val validationResult = emrPlugin.validateEMRAccuracy(syncResult.syncedRecords)
                if (!validationResult.isValid) {
                    throw DataValidationException("EMR data validation failed")
                }

                // Apply CRDT merge
                val mergedChanges = syncModule.syncData().getOrThrow()
                
                // Update local database with encryption
                mergedChanges.changes.forEach { change ->
                    val encryptedChange = securityModule.encryptChange(change)
                    database.encryptAndStore(encryptedChange)
                }

                // Update vector clocks
                database.vectorClockDao().update(mergedChanges.vectorClock)
            }

            // Verify sync duration meets SLA
            val syncDuration = Duration.between(startTime, Instant.now())
            if (syncDuration.toMillis() > MAX_SYNC_DURATION_MS) {
                Timber.w("Sync duration exceeded SLA: ${syncDuration.toMillis()}ms")
                metricsCollector.recordSlaBreach(syncDuration)
            }

            // Log successful sync
            metricsCollector.endSync(
                successful = true,
                recordsProcessed = syncResult?.syncedRecords ?: 0,
                duration = syncDuration
            )

            Timber.i("Background sync completed successfully")
            return@withContext Result.success()

        } catch (e: Exception) {
            Timber.e(e, "Background sync failed")
            return@withContext handleSyncFailure(
                e,
                SyncContext(attempt = runAttemptCount)
            )
        }
    }

    private fun handleSyncFailure(error: Exception, context: SyncContext): Result {
        metricsCollector.endSync(
            successful = false,
            error = error
        )

        return when {
            // Retry on network/transient errors with backoff
            (error is NetworkException || error is TransientException) && 
            context.attempt < MAX_RETRIES -> {
                Result.retry()
            }
            
            // Security errors require immediate attention
            error is SecurityException -> {
                securityModule.handleSecurityViolation(error)
                Result.failure()
            }
            
            // Data validation errors need investigation
            error is DataValidationException -> {
                emrPlugin.reportValidationFailure(error)
                Result.failure()
            }
            
            // General failure
            else -> Result.failure()
        }
    }

    companion object {
        fun schedulePeriodicSync(
            context: Context,
            config: SyncConfig
        ): Operation {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .setRequiresBatteryNotLow(true)
                .build()

            val request = PeriodicWorkRequestBuilder<SyncWorker>(
                repeatInterval = Duration.ofMinutes(15)
            )
            .setConstraints(constraints)
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                Duration.ofSeconds(30)
            )
            .addTag(SYNC_WORK_NAME)
            .build()

            return WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork(
                    SYNC_WORK_NAME,
                    ExistingPeriodicWorkPolicy.KEEP,
                    request
                )
        }
    }
}

private data class SyncContext(
    val attempt: Int
)

private class NetworkException(message: String) : Exception(message)
private class TransientException(message: String) : Exception(message)
private class DataValidationException(message: String) : Exception(message)