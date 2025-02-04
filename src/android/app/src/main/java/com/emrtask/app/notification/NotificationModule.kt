package com.emrtask.app.notification

import android.app.NotificationManager
import android.content.Context
import com.emrtask.security.AuditLogger
import com.emrtask.security.SecurityManager
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import java.time.Instant

/**
 * Dagger Hilt module providing HIPAA-compliant notification dependencies for the EMR Task application.
 * Implements secure notification handling with encryption, audit logging, and compliance monitoring.
 *
 * External library versions:
 * - dagger.hilt.android:hilt-android:2.44
 * - javax.inject:javax.inject:1
 */
@Module
@InstallIn(SingletonComponent::class)
object NotificationModule {

    private const val SECURE_CHANNEL_ID = "emr_secure_channel"
    private const val AUDIT_TAG = "NOTIFICATION"
    private const val DEFAULT_NOTIFICATION_IMPORTANCE = NotificationManager.IMPORTANCE_HIGH
    private const val DEFAULT_VIBRATION_PATTERN = longArrayOf(0, 250, 250, 250)
    private const val ENCRYPTION_ALGORITHM = "AES/GCM/NoPadding"
    private const val KEY_SIZE = 256

    /**
     * Provides singleton instance of NotificationManager with HIPAA-compliant security configuration.
     * Configures secure notification channels and delivery confirmation.
     */
    @Provides
    @Singleton
    fun provideNotificationManager(
        @ApplicationContext context: Context
    ): NotificationManager {
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) 
                as NotificationManager

        // Create secure notification channel for Android O and above
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            android.app.NotificationChannel(
                SECURE_CHANNEL_ID,
                "EMR Task Notifications",
                DEFAULT_NOTIFICATION_IMPORTANCE
            ).apply {
                setShowBadge(true)
                enableVibration(true)
                vibrationPattern = DEFAULT_VIBRATION_PATTERN
                setBypassDnd(false)
                lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE
                notificationManager.createNotificationChannel(this)
            }
        }

        return notificationManager
    }

    /**
     * Provides singleton instance of SecurityManager for secure notification handling.
     * Implements encryption, key management, and security auditing.
     */
    @Provides
    @Singleton
    fun provideSecurityManager(
        @ApplicationContext context: Context
    ): SecurityManager {
        return SecurityManager.Builder(context)
            .setEncryptionAlgorithm(ENCRYPTION_ALGORITHM)
            .setKeySize(KEY_SIZE)
            .enableHardwareBackedKeys(true)
            .setKeyRotationInterval(24 * 60 * 60 * 1000) // 24 hours
            .setAuditLogging(true)
            .build()
    }

    /**
     * Provides singleton instance of NotificationService with HIPAA compliance features.
     * Implements secure notification delivery, encryption, and audit logging.
     */
    @Provides
    @Singleton
    fun provideNotificationService(
        @ApplicationContext context: Context,
        notificationManager: NotificationManager,
        securityManager: SecurityManager
    ): NotificationService {
        val auditLogger = AuditLogger.Builder()
            .setTag(AUDIT_TAG)
            .setSecurityLevel(AuditLogger.SecurityLevel.HIPAA)
            .setRetentionPeriod(7 * 24 * 60 * 60 * 1000) // 7 days
            .build()

        return NotificationService(
            context = context,
            notificationManager = notificationManager,
            securityManager = securityManager
        ).apply {
            // Initialize secure notification channels
            createNotificationChannel(
                channelId = SECURE_CHANNEL_ID,
                importance = DEFAULT_NOTIFICATION_IMPORTANCE,
                isPrivate = true,
                requiresAuth = true
            )

            // Configure encryption for notification payload
            securityManager.configureNotificationEncryption(
                algorithm = ENCRYPTION_ALGORITHM,
                keySize = KEY_SIZE
            )

            // Setup audit logging
            auditLogger.startLogging(
                timestamp = Instant.now(),
                component = "NotificationService",
                securityContext = securityManager.getSecurityContext()
            )
        }
    }
}