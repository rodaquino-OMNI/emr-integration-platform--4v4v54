package com.emrtask.app.security

import android.content.Context
import android.util.Base64
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.HiltAndroidApp
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.inject.Singleton
import java.time.Instant
import java.util.UUID

// External library versions:
// androidx.security:security-crypto:1.1.0-alpha06
// com.google.dagger:hilt-android:2.44

/**
 * HIPAA-compliant encryption module for securing sensitive healthcare data.
 * Implements AES-256-GCM encryption with secure key management and rotation.
 */
@HiltAndroidApp
@Singleton
class EncryptionModule @Inject constructor(
    private val context: Context,
    private val keyRotationManager: KeyRotationManager,
    private val complianceLogger: ComplianceLogger
) {
    companion object {
        private const val ALGORITHM = "AES/GCM/NoPadding"
        private const val KEY_SIZE = 256
        private const val IV_SIZE = 12
        private const val TAG_SIZE = 16
        private const val KEY_ROTATION_DAYS = 365
        private const val COMPLIANCE_CHECK_INTERVAL = 24 // hours
        
        private const val PREF_FILE_NAME = "encrypted_keys"
        private const val KEY_ALIAS_PREFIX = "emr_key_"
        private const val CURRENT_KEY_ALIAS = "current_key_alias"
        private const val KEY_CREATION_TIME = "key_creation_time"
    }

    private val masterKey: MasterKey
    private val encryptedPrefs: EncryptedSharedPreferences
    private val secureRandom = SecureRandom()

    init {
        // Initialize master key with hardware-backed KeyStore
        masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .setUserAuthenticationRequired(true)
            .setRequestStrongBoxBacked(true)
            .build()

        // Setup encrypted shared preferences
        encryptedPrefs = EncryptedSharedPreferences.create(
            context,
            PREF_FILE_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        ) as EncryptedSharedPreferences

        validateHardwareSecurityModule()
        initializeKeyIfNeeded()
    }

    /**
     * Encrypts sensitive data using AES-256-GCM with authentication.
     * @param data ByteArray of data to encrypt
     * @param isPhiData Boolean indicating if data contains PHI/PII
     * @return EncryptedData object containing encrypted data and metadata
     */
    fun encryptData(data: ByteArray, isPhiData: Boolean = true): EncryptedData {
        validateDataInput(data)
        checkKeyRotation()

        val iv = ByteArray(IV_SIZE).apply { secureRandom.nextBytes(this) }
        val cipher = Cipher.getInstance(ALGORITHM)
        val currentKey = getCurrentKey()

        val gcmSpec = GCMParameterSpec(TAG_SIZE * 8, iv)
        cipher.init(Cipher.ENCRYPT_MODE, currentKey, gcmSpec)

        // Add authentication data if PHI
        if (isPhiData) {
            val authData = generateAuthenticationData()
            cipher.updateAAD(authData)
        }

        val encryptedData = cipher.doFinal(data)
        val operationId = UUID.randomUUID().toString()

        // Log encryption operation
        complianceLogger.logEncryption(
            operationId = operationId,
            isPhiData = isPhiData,
            keyAlias = getCurrentKeyAlias(),
            timestamp = Instant.now()
        )

        return EncryptedData(
            data = encryptedData,
            iv = iv,
            operationId = operationId,
            timestamp = Instant.now(),
            isPhiData = isPhiData
        )
    }

    /**
     * Decrypts encrypted data with integrity validation.
     * @param encryptedData EncryptedData object containing data to decrypt
     * @return ByteArray of decrypted data
     */
    fun decryptData(encryptedData: EncryptedData): ByteArray {
        validateEncryptedData(encryptedData)

        val cipher = Cipher.getInstance(ALGORITHM)
        val currentKey = getCurrentKey()

        val gcmSpec = GCMParameterSpec(TAG_SIZE * 8, encryptedData.iv)
        cipher.init(Cipher.DECRYPT_MODE, currentKey, gcmSpec)

        if (encryptedData.isPhiData) {
            val authData = generateAuthenticationData()
            cipher.updateAAD(authData)
        }

        val decryptedData = cipher.doFinal(encryptedData.data)

        // Log decryption operation
        complianceLogger.logDecryption(
            operationId = UUID.randomUUID().toString(),
            originalOperationId = encryptedData.operationId,
            isPhiData = encryptedData.isPhiData,
            keyAlias = getCurrentKeyAlias(),
            timestamp = Instant.now()
        )

        return decryptedData
    }

    /**
     * Performs secure key rotation with data re-encryption.
     * @return Boolean indicating success of key rotation
     */
    fun rotateKey(): Boolean {
        try {
            val newKeyAlias = "${KEY_ALIAS_PREFIX}${UUID.randomUUID()}"
            val newKey = generateNewKey(newKeyAlias)
            val oldKeyAlias = getCurrentKeyAlias()

            // Store new key metadata
            encryptedPrefs.edit().apply {
                putString(CURRENT_KEY_ALIAS, newKeyAlias)
                putLong(KEY_CREATION_TIME, Instant.now().epochSecond)
            }.apply()

            // Log key rotation
            complianceLogger.logKeyRotation(
                oldKeyAlias = oldKeyAlias,
                newKeyAlias = newKeyAlias,
                timestamp = Instant.now()
            )

            keyRotationManager.handleKeyRotation(oldKeyAlias, newKeyAlias)
            return true
        } catch (e: Exception) {
            complianceLogger.logError("Key rotation failed", e)
            return false
        }
    }

    /**
     * Validates encryption compliance status.
     * @return ComplianceReport detailing current compliance status
     */
    fun validateCompliance(): ComplianceReport {
        val keyAge = getKeyAge()
        val hardwareSecurityEnabled = isHardwareSecurityEnabled()
        val keyStrength = validateKeyStrength()

        return ComplianceReport(
            keyAge = keyAge,
            keyStrengthValid = keyStrength,
            hardwareSecurityEnabled = hardwareSecurityEnabled,
            lastRotationDate = getLastKeyRotationDate(),
            complianceStatus = determineComplianceStatus(keyAge, keyStrength, hardwareSecurityEnabled)
        )
    }

    private fun validateHardwareSecurityModule() {
        if (!isHardwareSecurityEnabled()) {
            throw SecurityException("Hardware security module not available")
        }
    }

    private fun initializeKeyIfNeeded() {
        if (!encryptedPrefs.contains(CURRENT_KEY_ALIAS)) {
            val initialKeyAlias = "${KEY_ALIAS_PREFIX}${UUID.randomUUID()}"
            generateNewKey(initialKeyAlias)
            encryptedPrefs.edit().apply {
                putString(CURRENT_KEY_ALIAS, initialKeyAlias)
                putLong(KEY_CREATION_TIME, Instant.now().epochSecond)
            }.apply()
        }
    }

    private fun getCurrentKey(): SecretKey {
        val keyAlias = getCurrentKeyAlias()
        return keyRotationManager.getKey(keyAlias)
            ?: throw SecurityException("Current encryption key not found")
    }

    private fun getCurrentKeyAlias(): String {
        return encryptedPrefs.getString(CURRENT_KEY_ALIAS, null)
            ?: throw SecurityException("No current key alias found")
    }

    private fun generateAuthenticationData(): ByteArray {
        // Generate unique authentication data for PHI
        return UUID.randomUUID().toString().toByteArray()
    }

    private fun validateDataInput(data: ByteArray) {
        if (data.isEmpty()) {
            throw IllegalArgumentException("Input data cannot be empty")
        }
    }

    private fun validateEncryptedData(encryptedData: EncryptedData) {
        if (encryptedData.iv.size != IV_SIZE) {
            throw SecurityException("Invalid IV size")
        }
    }

    private fun checkKeyRotation() {
        val keyAge = getKeyAge()
        if (keyAge >= KEY_ROTATION_DAYS) {
            rotateKey()
        }
    }

    private fun getKeyAge(): Long {
        val creationTime = encryptedPrefs.getLong(KEY_CREATION_TIME, 0)
        return (Instant.now().epochSecond - creationTime) / (24 * 3600)
    }

    private fun isHardwareSecurityEnabled(): Boolean {
        return masterKey.isStrongBoxBacked
    }

    private fun validateKeyStrength(): Boolean {
        return masterKey.keySize >= KEY_SIZE
    }

    private fun getLastKeyRotationDate(): Instant {
        val creationTime = encryptedPrefs.getLong(KEY_CREATION_TIME, 0)
        return Instant.ofEpochSecond(creationTime)
    }

    private fun determineComplianceStatus(
        keyAge: Long,
        keyStrength: Boolean,
        hardwareSecurityEnabled: Boolean
    ): ComplianceStatus {
        return when {
            !hardwareSecurityEnabled -> ComplianceStatus.HARDWARE_SECURITY_DISABLED
            !keyStrength -> ComplianceStatus.INSUFFICIENT_KEY_STRENGTH
            keyAge >= KEY_ROTATION_DAYS -> ComplianceStatus.KEY_ROTATION_REQUIRED
            else -> ComplianceStatus.COMPLIANT
        }
    }
}

data class EncryptedData(
    val data: ByteArray,
    val iv: ByteArray,
    val operationId: String,
    val timestamp: Instant,
    val isPhiData: Boolean
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false

        other as EncryptedData
        return data.contentEquals(other.data) &&
                iv.contentEquals(other.iv) &&
                operationId == other.operationId &&
                timestamp == other.timestamp &&
                isPhiData == other.isPhiData
    }

    override fun hashCode(): Int {
        var result = data.contentHashCode()
        result = 31 * result + iv.contentHashCode()
        result = 31 * result + operationId.hashCode()
        result = 31 * result + timestamp.hashCode()
        result = 31 * result + isPhiData.hashCode()
        return result
    }
}

data class ComplianceReport(
    val keyAge: Long,
    val keyStrengthValid: Boolean,
    val hardwareSecurityEnabled: Boolean,
    val lastRotationDate: Instant,
    val complianceStatus: ComplianceStatus
)

enum class ComplianceStatus {
    COMPLIANT,
    KEY_ROTATION_REQUIRED,
    INSUFFICIENT_KEY_STRENGTH,
    HARDWARE_SECURITY_DISABLED
}