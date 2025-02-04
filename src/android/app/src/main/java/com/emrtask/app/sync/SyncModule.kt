package com.emrtask.app.sync

import android.Manifest
import android.content.Context
import androidx.annotation.RequiresPermission
import androidx.annotation.WorkerThread
import com.emrtask.app.database.OfflineDatabase
import com.squareup.retrofit2.Retrofit
import com.squareup.retrofit2.converter.gson.GsonConverterFactory
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlin.time.Duration.Companion.milliseconds

/**
 * Core synchronization module implementing CRDT-based offline-first data synchronization
 * with optimized performance, enhanced error handling, and HIPAA-compliant data processing.
 *
 * @version 1.0.0
 * @see OfflineDatabase for local storage implementation
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SyncModule private constructor(private val context: Context) {

    private val database: OfflineDatabase by lazy {
        OfflineDatabase.getInstance(context, getEncryptionKey())
    }

    private val okHttpClient = OkHttpClient.Builder()
        .connectTimeout(SYNC_TIMEOUT_MS.milliseconds)
        .readTimeout(SYNC_TIMEOUT_MS.milliseconds)
        .writeTimeout(SYNC_TIMEOUT_MS.milliseconds)
        .retryOnConnectionFailure(true)
        .addInterceptor(CompressionInterceptor())
        .addInterceptor(HIPAACompliantLoggingInterceptor())
        .build()

    private val retrofit = Retrofit.Builder()
        .baseUrl(BuildConfig.SYNC_API_URL)
        .client(okHttpClient)
        .addConverterFactory(GsonConverterFactory.create())
        .build()

    private val syncApi = retrofit.create(SyncApi::class.java)
    private val vectorClock = AtomicReference<VectorClock>()
    private val networkMonitor = NetworkMonitor(context)
    private val syncMetrics = SyncMetrics()
    private val syncMutex = Mutex()
    private val retryPolicy = ExponentialBackoffRetry(
        maxAttempts = MAX_RETRY_ATTEMPTS,
        initialDelayMs = 1000,
        maxDelayMs = 30000
    )

    /**
     * Synchronizes local data with backend using optimized CRDT-based merge.
     * Implements batched processing, compression, and HIPAA-compliant error handling.
     *
     * @throws SyncException if synchronization fails after retries
     * @return Result containing sync status and metrics
     */
    @WorkerThread
    @Throws(SyncException::class)
    @RequiresPermission(Manifest.permission.INTERNET)
    suspend fun syncData(): Result<SyncResult> = syncMutex.withLock {
        try {
            syncMetrics.startSync()

            // Validate network connectivity
            if (!networkMonitor.isConnected()) {
                return Result.failure(SyncException.NetworkUnavailable)
            }

            // Get local changes with batching
            val localChanges = database.taskDao().getUnsynced(SYNC_BATCH_SIZE)
            val currentVectorClock = database.vectorClockDao().getCurrent()
            
            // Compress and send changes to backend
            val syncRequest = SyncRequest(
                changes = localChanges,
                vectorClock = currentVectorClock,
                deviceId = getDeviceId(),
                compressionEnabled = true
            )

            // Fetch remote changes with retry
            val remoteChanges = retryPolicy.execute {
                syncApi.sync(syncRequest)
            }

            // Merge changes using CRDT
            val mergedChanges = mergeChanges(localChanges, remoteChanges.changes)
            
            // Validate merged state
            validateMergedState(mergedChanges)

            // Update local database atomically
            database.runInTransaction {
                database.taskDao().applyChanges(mergedChanges)
                database.vectorClockDao().update(remoteChanges.vectorClock)
            }

            syncMetrics.endSync(successful = true)
            return Result.success(
                SyncResult(
                    changesApplied = mergedChanges.size,
                    syncDuration = syncMetrics.getLastSyncDuration(),
                    vectorClock = remoteChanges.vectorClock
                )
            )

        } catch (e: Exception) {
            syncMetrics.endSync(successful = false)
            val syncError = when (e) {
                is retrofit2.HttpException -> SyncException.ServerError(e)
                is java.net.SocketTimeoutException -> SyncException.Timeout(e)
                else -> SyncException.Unknown(e)
            }
            return Result.failure(syncError)
        }
    }

    /**
     * Merges local and remote changes using enhanced CRDT rules.
     * Implements optimized conflict resolution with priority-based ordering.
     */
    @WorkerThread
    private fun mergeChanges(
        localChanges: List<TaskChange>,
        remoteChanges: List<TaskChange>
    ): List<TaskChange> {
        val merged = mutableListOf<TaskChange>()
        val localMap = localChanges.associateBy { it.taskId }
        val remoteMap = remoteChanges.associateBy { it.taskId }

        // Process all task IDs
        (localMap.keys + remoteMap.keys).forEach { taskId ->
            val local = localMap[taskId]
            val remote = remoteMap[taskId]

            when {
                // Both have changes - need to merge
                local != null && remote != null -> {
                    merged.add(
                        when {
                            // Remote is newer
                            remote.vectorClock > local.vectorClock -> remote
                            // Local is newer
                            local.vectorClock > remote.vectorClock -> local
                            // Same version - merge based on priority
                            else -> mergePriority(local, remote)
                        }
                    )
                }
                // Only local changes
                local != null -> merged.add(local)
                // Only remote changes
                remote != null -> merged.add(remote)
            }
        }

        return merged.sortedBy { it.vectorClock }
    }

    private fun mergePriority(local: TaskChange, remote: TaskChange): TaskChange {
        // Priority order: Critical > High > Normal > Low
        return if (getPriority(local.status) >= getPriority(remote.status)) {
            local
        } else {
            remote
        }
    }

    private fun getPriority(status: TaskStatus): Int = when (status) {
        TaskStatus.CRITICAL -> 3
        TaskStatus.HIGH -> 2
        TaskStatus.NORMAL -> 1
        TaskStatus.LOW -> 0
    }

    companion object {
        private const val TAG = "SyncModule"
        private const val SYNC_BATCH_SIZE = 100
        private const val MAX_RETRY_ATTEMPTS = 3
        private const val SYNC_TIMEOUT_MS = 30000L

        @Volatile
        private var INSTANCE: SyncModule? = null

        fun getInstance(context: Context): SyncModule {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: SyncModule(context.applicationContext).also {
                    INSTANCE = it
                }
            }
        }
    }
}