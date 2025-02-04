package com.emrtask.app

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.emrtask.app.database.OfflineDatabase
import com.emrtask.app.security.EncryptionModule
import com.emrtask.app.sync.SyncModule
import com.emrtask.app.notification.NotificationModule
import com.emrtask.app.barcode.BarcodeModule
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.time.Instant
import javax.inject.Inject

/**
 * Comprehensive instrumented test class for validating EMR Task Android application functionality.
 * Tests core features, security measures, offline capabilities, and HIPAA compliance.
 *
 * External library versions:
 * - androidx.test:core:1.5.0
 * - androidx.test.ext:junit:1.1.5
 * - dagger.hilt.android.testing:2.44
 * - org.junit:junit:4.13.2
 */
@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class ExampleInstrumentedTest {

    @get:Rule
    var hiltRule = HiltAndroidRule(this)

    @Inject
    lateinit var database: OfflineDatabase

    @Inject
    lateinit var encryptionModule: EncryptionModule

    @Inject
    lateinit var syncModule: SyncModule

    @Inject
    lateinit var notificationModule: NotificationModule

    @Inject
    lateinit var barcodeModule: BarcodeModule

    private lateinit var context: Context
    private lateinit var application: EMRTaskApplication

    @Before
    fun setUp() {
        hiltRule.inject()
        context = ApplicationProvider.getApplicationContext()
        application = context as EMRTaskApplication
    }

    @Test
    fun useAppContext() {
        // Validate application context
        val appContext = InstrumentationRegistry.getInstrumentation().targetContext
        assertEquals("com.emrtask.app", appContext.packageName)
        assertTrue(appContext.applicationContext is EMRTaskApplication)

        // Verify core components initialization
        assertNotNull(database)
        assertNotNull(encryptionModule)
        assertNotNull(syncModule)
        assertNotNull(notificationModule)
        assertNotNull(barcodeModule)
    }

    @Test
    fun validateSecurityMeasures() {
        // Verify encryption initialization
        val encryptionStatus = encryptionModule.validateCompliance()
        assertTrue("Encryption must be HIPAA compliant", encryptionStatus.keyStrengthValid)
        assertTrue("Hardware security must be enabled", encryptionStatus.hardwareSecurityEnabled)

        // Test secure key storage
        val testData = "test_data".toByteArray()
        val encryptedData = encryptionModule.encryptData(testData, isPhiData = true)
        assertNotNull("Encryption must generate valid IV", encryptedData.iv)
        assertEquals("Encryption timestamp must be recent",
            Instant.now().epochSecond - encryptedData.timestamp.epochSecond < 5,
            true
        )

        // Verify secure preferences
        val decryptedData = encryptionModule.decryptData(encryptedData)
        assertArrayEquals("Decryption must restore original data", testData, decryptedData)

        // Validate HIPAA compliance settings
        assertTrue("Notification module must be HIPAA compliant",
            notificationModule.verifyHIPAACompliance())
    }

    @Test
    fun validateOfflineCapabilities() {
        // Verify database initialization
        assertTrue("Database must be encrypted", database.isEncrypted())
        
        // Test offline data persistence
        val testTask = createTestTask()
        database.taskDao().insert(testTask)
        val retrievedTask = database.taskDao().getTaskById(testTask.id)
        assertNotNull("Task must be persisted offline", retrievedTask)
        
        // Verify sync status tracking
        val syncStatus = syncModule.getSyncStatus()
        assertNotNull("Sync status must be tracked", syncStatus)
        
        // Test conflict resolution
        val conflictResult = syncModule.resolveConflict(testTask)
        assertTrue("Conflict resolution must succeed", conflictResult.isSuccess)
    }

    @Test
    fun validateBarcodeScanning() {
        // Test secure scanner initialization
        assertTrue("Barcode scanner must be initialized", barcodeModule.isInitialized())
        
        // Verify secure scanning
        val scanResult = barcodeModule.verifyBarcodeSecurely(
            taskId = "test_task",
            barcodeData = "test_barcode",
            object : SecureScannerCallback {
                override fun onSecureScan(
                    encryptedData: EncryptedData,
                    result: VerificationResult
                ) {
                    assertTrue("Barcode verification must succeed", result.isValid)
                    assertNotNull("EMR match details must be present", result.emrMatchDetails)
                }
            }
        )
        assertNotNull("Scan result must be available", scanResult)
    }

    private fun createTestTask() = Task(
        id = "test_task_${System.currentTimeMillis()}",
        title = "Test Task",
        description = "Test Description",
        status = TaskStatus.PENDING,
        dueDate = System.currentTimeMillis(),
        patientId = "test_patient",
        assignedTo = "test_user",
        emrData = "{\"test\": \"data\"}",
        version = "1"
    )
}