package com.emrtask.app.notification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.*
import com.emrtask.app.plugins.EMRPlugin
import com.google.android.security.SecurityManager
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.*
import timber.log.Timber
import java.time.Instant
import java.util.*
import javax.inject.Inject
import javax.inject.Singleton

// External library versions:
// androidx.work:work-runtime-ktx:2.8.1
// com.google.firebase:firebase-messaging:23.1.2
// com.google.android.security:security-manager:1.0.0

@AndroidEntryPoint
@Singleton
class NotificationService @Inject constructor(
    private val context: Context,
    private val notificationManager: NotificationManager,
    private val emrPlugin: EMRPlugin,
    private val securityManager: SecurityManager,
    private val workManager: WorkManager
) : FirebaseMessagingService() {

    private val notificationScope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private val notificationCache = Collections.synchronizedMap(mutableMapOf<String, NotificationData>())

    companion object {
        private const val CHANNEL_ID_TASKS = "emr_tasks_channel"
        private const val CHANNEL_ID_HANDOVER = "shift_handover_channel"
        private const val CHANNEL_ID_CRITICAL = "critical_alerts_channel"
        private const val DEFAULT_NOTIFICATION_IMPORTANCE = NotificationManager.IMPORTANCE_HIGH
        private const val CRITICAL_NOTIFICATION_IMPORTANCE = NotificationManager.IMPORTANCE_MAX
        private const val MAX_RETRY_ATTEMPTS = 3
        private const val RETRY_DELAY_MS = 5000L
        private const val NOTIFICATION_ENCRYPTION_ALGORITHM = "AES/GCM/NoPadding"
    }

    init {
        createSecureNotificationChannels()
    }

    override fun onCreate() {
        super.onCreate()
        Timber.plant(Timber.DebugTree())
    }

    private fun createSecureNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Task notifications channel
            NotificationChannel(
                CHANNEL_ID_TASKS,
                "Task Notifications",
                DEFAULT_NOTIFICATION_IMPORTANCE
            ).apply {
                setShowBadge(true)
                setBypassDnd(false)
                lockscreenVisibility = NotificationCompat.VISIBILITY_PRIVATE
                notificationManager.createNotificationChannel(this)
            }

            // Handover notifications channel
            NotificationChannel(
                CHANNEL_ID_HANDOVER,
                "Shift Handover Notifications",
                DEFAULT_NOTIFICATION_IMPORTANCE
            ).apply {
                setShowBadge(true)
                setBypassDnd(true)
                lockscreenVisibility = NotificationCompat.VISIBILITY_PRIVATE
                notificationManager.createNotificationChannel(this)
            }

            // Critical alerts channel
            NotificationChannel(
                CHANNEL_ID_CRITICAL,
                "Critical Alerts",
                CRITICAL_NOTIFICATION_IMPORTANCE
            ).apply {
                setShowBadge(true)
                setBypassDnd(true)
                enableVibration(true)
                lockscreenVisibility = NotificationCompat.VISIBILITY_PRIVATE
                notificationManager.createNotificationChannel(this)
            }
        }
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        
        notificationScope.launch {
            try {
                val notificationData = decryptNotificationPayload(remoteMessage.data)
                
                when (notificationData.type) {
                    NotificationType.TASK -> handleTaskNotification(notificationData)
                    NotificationType.HANDOVER -> handleHandoverNotification(notificationData)
                    NotificationType.CRITICAL -> handleCriticalNotification(notificationData)
                }
            } catch (e: Exception) {
                Timber.e(e, "Failed to process notification")
                handleOfflineNotification(
                    UUID.randomUUID().toString(),
                    NotificationData.fromRemoteMessage(remoteMessage)
                )
            }
        }
    }

    private suspend fun handleTaskNotification(data: NotificationData) {
        if (data.requiresVerification) {
            val verificationResult = emrPlugin.verifyTaskData(
                data.taskId,
                data.emrData,
                data.securityContext
            )
            
            if (verificationResult.isSuccess) {
                showSecureTaskNotification(
                    data.taskId,
                    data.title,
                    data.message,
                    data.priority,
                    true
                )
            } else {
                Timber.w("EMR verification failed for task: ${data.taskId}")
                handleOfflineNotification(data.taskId, data)
            }
        } else {
            showSecureTaskNotification(
                data.taskId,
                data.title,
                data.message,
                data.priority,
                false
            )
        }
    }

    private suspend fun handleHandoverNotification(data: NotificationData) {
        val handoverIntent = createSecureIntent(
            "com.emrtask.app.HANDOVER_ACTION",
            data.handoverId
        )
        
        val notification = NotificationCompat.Builder(context, CHANNEL_ID_HANDOVER)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(data.title)
            .setContentText(data.message)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setContentIntent(handoverIntent)
            .build()

        notificationManager.notify(data.handoverId.hashCode(), notification)
    }

    private suspend fun handleCriticalNotification(data: NotificationData) {
        val criticalIntent = createSecureIntent(
            "com.emrtask.app.CRITICAL_ACTION",
            data.alertId
        )
        
        val notification = NotificationCompat.Builder(context, CHANNEL_ID_CRITICAL)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle("⚠️ ${data.title}")
            .setContentText(data.message)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(false)
            .setOngoing(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setContentIntent(criticalIntent)
            .build()

        notificationManager.notify(data.alertId.hashCode(), notification)
    }

    private suspend fun showSecureTaskNotification(
        taskId: String,
        title: String,
        message: String,
        priority: TaskPriority,
        verified: Boolean
    ) {
        val taskIntent = createSecureIntent(
            "com.emrtask.app.TASK_ACTION",
            taskId
        )

        val channelId = when (priority) {
            TaskPriority.HIGH -> CHANNEL_ID_CRITICAL
            else -> CHANNEL_ID_TASKS
        }

        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(getTaskIcon(priority))
            .setContentTitle(title)
            .setContentText(message)
            .setPriority(getPriorityLevel(priority))
            .setCategory(NotificationCompat.CATEGORY_TASK)
            .setAutoCancel(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setContentIntent(taskIntent)
            .apply {
                if (verified) {
                    setSubText("✓ EMR Verified")
                }
            }
            .build()

        notificationManager.notify(taskId.hashCode(), notification)
    }

    private fun handleOfflineNotification(notificationId: String, data: NotificationData): Boolean {
        try {
            // Cache notification data
            notificationCache[notificationId] = data

            // Schedule retry work
            val retryWork = OneTimeWorkRequestBuilder<NotificationRetryWorker>()
                .setInputData(workDataOf(
                    "notification_id" to notificationId,
                    "retry_count" to 0
                ))
                .setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    RETRY_DELAY_MS,
                    TimeUnit.MILLISECONDS
                )
                .build()

            workManager.enqueueUniqueWork(
                "notification_retry_$notificationId",
                ExistingWorkPolicy.REPLACE,
                retryWork
            )

            return true
        } catch (e: Exception) {
            Timber.e(e, "Failed to handle offline notification")
            return false
        }
    }

    private suspend fun decryptNotificationPayload(
        encryptedData: Map<String, String>
    ): NotificationData {
        return withContext(Dispatchers.Default) {
            val decryptedData = securityManager.decryptData(
                encryptedData["payload"]?.toByteArray() ?: throw SecurityException("Missing payload"),
                NOTIFICATION_ENCRYPTION_ALGORITHM
            )
            NotificationData.fromJson(String(decryptedData))
        }
    }

    private fun createSecureIntent(action: String, id: String): PendingIntent {
        return PendingIntent.getActivity(
            context,
            id.hashCode(),
            Intent(action).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra("id", id)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun getTaskIcon(priority: TaskPriority) = when (priority) {
        TaskPriority.HIGH -> android.R.drawable.ic_dialog_alert
        TaskPriority.MEDIUM -> android.R.drawable.ic_dialog_info
        TaskPriority.LOW -> android.R.drawable.ic_dialog_email
    }

    private fun getPriorityLevel(priority: TaskPriority) = when (priority) {
        TaskPriority.HIGH -> NotificationCompat.PRIORITY_MAX
        TaskPriority.MEDIUM -> NotificationCompat.PRIORITY_HIGH
        TaskPriority.LOW -> NotificationCompat.PRIORITY_DEFAULT
    }
}

enum class TaskPriority {
    HIGH,
    MEDIUM,
    LOW
}

enum class NotificationType {
    TASK,
    HANDOVER,
    CRITICAL
}

data class NotificationData(
    val type: NotificationType,
    val taskId: String? = null,
    val handoverId: String? = null,
    val alertId: String? = null,
    val title: String,
    val message: String,
    val priority: TaskPriority = TaskPriority.MEDIUM,
    val requiresVerification: Boolean = false,
    val emrData: String? = null,
    val securityContext: EMRPlugin.SecurityContext,
    val timestamp: Instant = Instant.now()
) {
    companion object {
        fun fromRemoteMessage(message: RemoteMessage): NotificationData {
            // Implementation for converting RemoteMessage to NotificationData
            TODO("Implement RemoteMessage conversion")
        }

        fun fromJson(json: String): NotificationData {
            // Implementation for parsing JSON to NotificationData
            TODO("Implement JSON parsing")
        }
    }
}