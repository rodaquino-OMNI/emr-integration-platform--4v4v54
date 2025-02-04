package com.emrtask.app.plugins

import android.content.Context
import androidx.annotation.WorkerThread
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import androidx.work.*
import com.emrtask.app.database.OfflineDatabase
import com.emrtask.app.sync.SyncModule
import dagger.hilt.android.HiltAndroidApp
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import java.util.concurrent.TimeUnit
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec

@HiltAndroidApp
@AndroidEntryPoint
class OfflinePlugin(
    private val context: Context,
    private val encryptionManager: EncryptionManager,
    private val metricsCollector: MetricsCollector
) {
    companion object {
        private const val TAG = "OfflinePlugin"
        private const val SYNC_INTERVAL = 900000L // 15 minutes
        private const val MAX_STORAGE_SIZE = 1073741824L // 1GB
        private const val MAX_RETRY_ATTEMPTS = 3
        private const val BATCH_SIZE = 100
        private const val ENCRYPTION_ALGORITHM = "AES/GCM/NoPadding"
        private const val GCM_TAG_LENGTH = 128
    }

    private val offlineDatabase: OfflineDatabase by lazy {
        OfflineDatabase.getInstance(context, encryptionManager.getEncryptionKey())
    }

    private val syncModule: SyncModule by lazy {
        SyncModule.getInstance(context)
    }

    private val workManager: WorkManager by lazy {
        WorkManager.getInstance(context)
    }

    private val storageManager = StorageManager(context, MAX_STORAGE_SIZE)
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    init {
        initializePlugin()
    }

    private fun initializePlugin() {
        // Initialize encryption with secure key storage
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        // Configure encrypted preferences
        EncryptedSharedPreferences.create(
            context,
            "offline_prefs",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )

        // Schedule periodic sync
        scheduleSyncWork()

        // Initialize metrics collection
        metricsCollector.initialize(TAG)
    }

    @WorkerThread
    @Throws(DatabaseException::class)
    suspend fun saveTask(task: Task): Result<Long> = withContext(Dispatchers.IO) {
        try {
            metricsCollector.startOperation("save_task")

            // Encrypt task data
            val encryptedTask = encryptTask(task)

            // Begin database transaction
            offlineDatabase.runInTransaction {
                // Save task with retry mechanism
                var attempts = 0
                var taskId: Long? = null

                while (attempts < MAX_RETRY_ATTEMPTS && taskId == null) {
                    try {
                        taskId = offlineDatabase.taskDao().insertTask(encryptedTask)
                        
                        // Update vector clock
                        offlineDatabase.vectorClockDao().incrementClock(
                            nodeId = getDeviceId(),
                            taskId = taskId
                        )

                        // Log audit trail
                        offlineDatabase.auditLogDao().insertAuditLog(
                            AuditLog(
                                eventType = "TASK_CREATED",
                                taskId = taskId,
                                userId = getCurrentUserId(),
                                deviceInfo = getDeviceInfo()
                            )
                        )
                    } catch (e: Exception) {
                        attempts++
                        if (attempts >= MAX_RETRY_ATTEMPTS) throw e
                        delay(100 * attempts.toLong())
                    }
                }

                // Schedule background sync
                scheduleSyncWork()

                taskId ?: throw DatabaseException("Failed to save task after $MAX_RETRY_ATTEMPTS attempts")
            }

            metricsCollector.endOperation("save_task", true)
            Result.success(taskId)
        } catch (e: Exception) {
            metricsCollector.endOperation("save_task", false)
            Result.failure(DatabaseException("Failed to save task", e))
        }
    }

    @WorkerThread
    suspend fun getTask(taskId: String): Task? = withContext(Dispatchers.IO) {
        try {
            metricsCollector.startOperation("get_task")

            // Query encrypted task
            val encryptedTask = offlineDatabase.taskDao().getTask(taskId)

            // Decrypt and return task
            encryptedTask?.let {
                decryptTask(it).also {
                    // Log access
                    offlineDatabase.auditLogDao().insertAuditLog(
                        AuditLog(
                            eventType = "TASK_ACCESSED",
                            taskId = taskId,
                            userId = getCurrentUserId(),
                            deviceInfo = getDeviceInfo()
                        )
                    )
                }
            }

            metricsCollector.endOperation("get_task", true)
            encryptedTask
        } catch (e: Exception) {
            metricsCollector.endOperation("get_task", false)
            null
        }
    }

    fun scheduleSyncWork() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .setRequiresBatteryNotLow(true)
            .build()

        val syncRequest = PeriodicWorkRequestBuilder<SyncWorker>(
            SYNC_INTERVAL,
            TimeUnit.MILLISECONDS
        )
            .setConstraints(constraints)
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                WorkRequest.MIN_BACKOFF_MILLIS,
                TimeUnit.MILLISECONDS
            )
            .build()

        workManager.enqueueUniquePeriodicWork(
            "sync_work",
            ExistingPeriodicWorkPolicy.REPLACE,
            syncRequest
        )
    }

    private fun encryptTask(task: Task): EncryptedTask {
        val cipher = Cipher.getInstance(ENCRYPTION_ALGORITHM)
        val iv = encryptionManager.generateIV()
        
        cipher.init(
            Cipher.ENCRYPT_MODE,
            encryptionManager.getSecretKey(),
            GCMParameterSpec(GCM_TAG_LENGTH, iv)
        )

        val encryptedData = cipher.doFinal(task.toByteArray())
        
        return EncryptedTask(
            id = task.id,
            data = encryptedData,
            iv = iv,
            version = task.version
        )
    }

    private fun decryptTask(encryptedTask: EncryptedTask): Task {
        val cipher = Cipher.getInstance(ENCRYPTION_ALGORITHM)
        
        cipher.init(
            Cipher.DECRYPT_MODE,
            encryptionManager.getSecretKey(),
            GCMParameterSpec(GCM_TAG_LENGTH, encryptedTask.iv)
        )

        val decryptedData = cipher.doFinal(encryptedTask.data)
        return Task.fromByteArray(decryptedData)
    }

    fun getMetrics(): Flow<SyncMetrics> = metricsCollector.getMetrics()

    private class SyncWorker(
        context: Context,
        params: WorkerParameters
    ) : CoroutineWorker(context, params) {
        override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
            try {
                val syncModule = SyncModule.getInstance(applicationContext)
                val syncResult = syncModule.syncData()
                
                if (syncResult.isSuccess) {
                    Result.success()
                } else {
                    Result.retry()
                }
            } catch (e: Exception) {
                Result.failure()
            }
        }
    }
}