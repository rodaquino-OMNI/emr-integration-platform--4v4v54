package com.emrtask.app.security

import android.content.Context
import android.os.Build
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import dagger.hilt.android.HiltAndroidApp
import java.time.Instant
import java.util.concurrent.Executor
import javax.inject.Inject
import javax.inject.Singleton

// External library versions:
// androidx.biometric:biometric:1.2.0-alpha05
// androidx.fragment:fragment:1.5.0
// dagger.hilt.android:hilt-android:2.44
// com.emrtask.security.logging:compliance-logger:1.0.0

/**
 * HIPAA-compliant biometric authentication module for healthcare staff access.
 * Implements secure biometric verification with hardware security module integration.
 */
@HiltAndroidApp
@Singleton
class BiometricModule @Inject constructor(
    private val encryptionModule: EncryptionModule,
    private val complianceLogger: ComplianceLogger
) {
    companion object {
        private const val BIOMETRIC_KEY_SIZE = 256
        private const val BIOMETRIC_TIMEOUT_MS = 30000L
        private const val MAX_RETRY_ATTEMPTS = 3
        private const val KEY_ROTATION_INTERVAL_DAYS = 90
    }

    private lateinit var biometricExecutor: Executor
    private lateinit var biometricPrompt: BiometricPrompt
    private var retryAttempts = 0
    private var isHardwareSecure = false

    private val promptInfo = BiometricPrompt.PromptInfo.Builder()
        .setTitle("Healthcare Staff Authentication")
        .setSubtitle("Verify your identity to access EMR data")
        .setDescription("Authentication required for HIPAA compliance")
        .setNegativeButtonText("Cancel")
        .setConfirmationRequired(true)
        .setAllowedAuthenticators(
            BiometricManager.Authenticators.BIOMETRIC_STRONG or
            BiometricManager.Authenticators.DEVICE_CREDENTIAL
        )
        .build()

    /**
     * Initiates biometric authentication flow with enhanced security checks.
     * @param activity FragmentActivity context for biometric prompt
     * @param callback BiometricAuthCallback for authentication results
     */
    fun authenticateUser(
        activity: FragmentActivity,
        callback: BiometricAuthCallback
    ) {
        if (!isHardwareSecure) {
            callback.onError(
                BiometricAuthError.HARDWARE_UNAVAILABLE,
                "Secure hardware not available"
            )
            return
        }

        val authenticationStartTime = Instant.now()
        
        biometricExecutor = ContextCompat.getMainExecutor(activity)
        biometricPrompt = BiometricPrompt(activity, biometricExecutor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(
                    result: BiometricPrompt.AuthenticationResult
                ) {
                    retryAttempts = 0
                    val authDuration = Instant.now().toEpochMilli() - 
                        authenticationStartTime.toEpochMilli()

                    complianceLogger.logAuthenticationSuccess(
                        userId = result.authenticationType.toString(),
                        authMethod = "BIOMETRIC",
                        duration = authDuration,
                        timestamp = Instant.now()
                    )

                    createBiometricKey()?.let { key ->
                        callback.onSuccess(key)
                    } ?: callback.onError(
                        BiometricAuthError.KEY_GENERATION_FAILED,
                        "Failed to generate biometric key"
                    )
                }

                override fun onAuthenticationError(
                    errorCode: Int,
                    errString: CharSequence
                ) {
                    complianceLogger.logAuthenticationFailure(
                        errorCode = errorCode,
                        errorMessage = errString.toString(),
                        timestamp = Instant.now()
                    )

                    when (errorCode) {
                        BiometricPrompt.ERROR_HW_NOT_PRESENT,
                        BiometricPrompt.ERROR_HW_UNAVAILABLE -> {
                            callback.onError(
                                BiometricAuthError.HARDWARE_UNAVAILABLE,
                                errString.toString()
                            )
                        }
                        BiometricPrompt.ERROR_LOCKOUT,
                        BiometricPrompt.ERROR_LOCKOUT_PERMANENT -> {
                            callback.onError(
                                BiometricAuthError.LOCKOUT,
                                errString.toString()
                            )
                        }
                        else -> callback.onError(
                            BiometricAuthError.AUTHENTICATION_FAILED,
                            errString.toString()
                        )
                    }
                }

                override fun onAuthenticationFailed() {
                    retryAttempts++
                    complianceLogger.logAuthenticationFailure(
                        errorCode = -1,
                        errorMessage = "Authentication failed attempt $retryAttempts",
                        timestamp = Instant.now()
                    )

                    if (retryAttempts >= MAX_RETRY_ATTEMPTS) {
                        callback.onError(
                            BiometricAuthError.MAX_ATTEMPTS_EXCEEDED,
                            "Maximum retry attempts exceeded"
                        )
                    }
                }
            })

        biometricPrompt.authenticate(promptInfo)
    }

    /**
     * Checks if device supports required biometric features with hardware security.
     * @param context Context for biometric manager
     * @return Boolean indicating if biometric authentication is available and secure
     */
    fun checkBiometricAvailability(context: Context): Boolean {
        val biometricManager = BiometricManager.from(context)
        
        val canAuthenticate = biometricManager.canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG
        )

        isHardwareSecure = when (canAuthenticate) {
            BiometricManager.BIOMETRIC_SUCCESS -> {
                encryptionModule.verifyHardwareSecurity()
            }
            else -> false
        }

        complianceLogger.logSecurityCheck(
            checkType = "BIOMETRIC_AVAILABILITY",
            result = isHardwareSecure,
            details = "Hardware security: $isHardwareSecure, " +
                "Can authenticate: ${canAuthenticate == BiometricManager.BIOMETRIC_SUCCESS}",
            timestamp = Instant.now()
        )

        return isHardwareSecure
    }

    /**
     * Creates and stores encrypted biometric key with enhanced security.
     * @return ByteArray? Encrypted biometric key material or null if generation fails
     */
    private fun createBiometricKey(): ByteArray? {
        return try {
            val keyMaterial = ByteArray(BIOMETRIC_KEY_SIZE / 8).apply {
                java.security.SecureRandom().nextBytes(this)
            }

            encryptionModule.encryptBiometricKey(
                keyMaterial = keyMaterial,
                timestamp = Instant.now(),
                rotationDays = KEY_ROTATION_INTERVAL_DAYS
            )
        } catch (e: Exception) {
            complianceLogger.logError(
                error = "Biometric key generation failed",
                exception = e,
                timestamp = Instant.now()
            )
            null
        }
    }
}

/**
 * Callback interface for biometric authentication results
 */
interface BiometricAuthCallback {
    fun onSuccess(keyMaterial: ByteArray)
    fun onError(error: BiometricAuthError, message: String)
}

/**
 * Enumeration of possible biometric authentication errors
 */
enum class BiometricAuthError {
    HARDWARE_UNAVAILABLE,
    AUTHENTICATION_FAILED,
    KEY_GENERATION_FAILED,
    MAX_ATTEMPTS_EXCEEDED,
    LOCKOUT
}