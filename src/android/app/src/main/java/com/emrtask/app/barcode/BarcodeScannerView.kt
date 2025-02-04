package com.emrtask.app.barcode

import android.Manifest
import android.content.Context
import android.util.AttributeSet
import android.view.WindowManager
import android.widget.FrameLayout
import androidx.annotation.RequiresPermission
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.emrtask.app.security.EncryptionModule
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

// External library versions:
// androidx.camera:camera-camera2:1.2.0
// androidx.camera:camera-lifecycle:1.2.0
// androidx.camera:camera-view:1.2.0
// com.google.mlkit:barcode-scanning:17.0.3
// org.jetbrains.kotlinx:kotlinx-coroutines-android:1.6.4
// com.squareup.retrofit2:retrofit:2.9.0

@RequiresPermission(Manifest.permission.CAMERA)
class BarcodeScannerView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : FrameLayout(context, attrs) {

    private lateinit var previewView: PreviewView
    private lateinit var cameraProvider: ProcessCameraProvider
    private lateinit var barcodeScanner: BarcodeScanner
    private lateinit var encryptionModule: EncryptionModule
    private lateinit var emrApiClient: EMRApiClient
    private var camera: Camera? = null
    private var callback: ScannerCallback? = null

    private val scannerScope = CoroutineScope(Dispatchers.Main + Job())
    private val _scanningState = MutableStateFlow<ScanningState>(ScanningState.Idle)

    companion object {
        private const val CAMERA_PERMISSION_REQUEST_CODE = 100
        private const val SCAN_TIMEOUT_MS = 30000L
        private const val EMR_API_TIMEOUT_MS = 5000L
        private const val SECURE_MEMORY_CLEAR_DELAY_MS = 1000L
        private const val MAX_RETRY_ATTEMPTS = 3
        private const val VERIFICATION_CACHE_SIZE = 100
    }

    init {
        setupSecureWindow()
        initializeComponents()
    }

    private fun setupSecureWindow() {
        // Prevent screen capture for HIPAA compliance
        context.findActivity()?.window?.setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        )
    }

    private fun initializeComponents() {
        // Initialize PreviewView
        previewView = PreviewView(context).apply {
            layoutParams = LayoutParams(
                LayoutParams.MATCH_PARENT,
                LayoutParams.MATCH_PARENT
            )
            implementationMode = PreviewView.ImplementationMode.PERFORMANCE
        }
        addView(previewView)

        // Initialize ML Kit barcode scanner with optimized options
        val options = BarcodeScannerOptions.Builder()
            .setBarcodeFormats(
                Barcode.FORMAT_QR_CODE,
                Barcode.FORMAT_CODE_128,
                Barcode.FORMAT_DATA_MATRIX
            )
            .enableAutoZoom(true)
            .build()
        barcodeScanner = BarcodeScanning.getClient(options)

        // Initialize encryption module
        encryptionModule = EncryptionModule(context)

        // Initialize EMR API client
        emrApiClient = Retrofit.Builder()
            .baseUrl(BuildConfig.EMR_API_BASE_URL)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(EMRApiClient::class.java)
    }

    @RequiresPermission(Manifest.permission.CAMERA)
    fun startScanning(scannerCallback: ScannerCallback) {
        this.callback = scannerCallback
        _scanningState.value = ScanningState.Starting

        scannerScope.launch {
            try {
                val cameraProvider = ProcessCameraProvider.getInstance(context).await()
                this@BarcodeScannerView.cameraProvider = cameraProvider

                // Configure camera use cases
                val preview = Preview.Builder()
                    .setTargetAspectRatio(AspectRatio.RATIO_16_9)
                    .build()
                    .also { it.setSurfaceProvider(previewView.surfaceProvider) }

                val imageAnalysis = ImageAnalysis.Builder()
                    .setTargetAspectRatio(AspectRatio.RATIO_16_9)
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                    .also { 
                        it.setAnalyzer(
                            ContextCompat.getMainExecutor(context),
                            createBarcodeAnalyzer()
                        )
                    }

                // Bind use cases to camera
                camera = cameraProvider.bindToLifecycle(
                    context as LifecycleOwner,
                    CameraSelector.DEFAULT_BACK_CAMERA,
                    preview,
                    imageAnalysis
                )

                setupCameraTimeout()
                _scanningState.value = ScanningState.Active
            } catch (e: Exception) {
                handleScannerError(e)
            }
        }
    }

    fun stopScanning() {
        scannerScope.launch {
            try {
                _scanningState.value = ScanningState.Stopping
                camera?.cameraControl?.enableTorch(false)
                cameraProvider.unbindAll()
                barcodeScanner.close()
                
                // Secure cleanup
                withContext(Dispatchers.Default) {
                    encryptionModule.secureMemoryClear()
                }
                
                callback = null
                _scanningState.value = ScanningState.Idle
            } catch (e: Exception) {
                handleScannerError(e)
            }
        }
    }

    private fun createBarcodeAnalyzer() = ImageAnalysis.Analyzer { imageProxy ->
        val mediaImage = imageProxy.image
        if (mediaImage != null) {
            val image = InputImage.fromMediaImage(
                mediaImage,
                imageProxy.imageInfo.rotationDegrees
            )

            barcodeScanner.process(image)
                .addOnSuccessListener { barcodes ->
                    barcodes.firstOrNull()?.let { barcode ->
                        handleBarcodeDetection(barcode)
                    }
                }
                .addOnFailureListener { e ->
                    handleScannerError(e)
                }
                .addOnCompleteListener {
                    imageProxy.close()
                }
        } else {
            imageProxy.close()
        }
    }

    private fun handleBarcodeDetection(barcode: Barcode) {
        scannerScope.launch {
            try {
                val barcodeData = barcode.rawValue ?: return@launch
                
                // Encrypt barcode data immediately
                val encryptedData = encryptionModule.encryptData(
                    barcodeData.toByteArray(),
                    isPhiData = true
                )

                // Verify with EMR
                val verificationResult = withContext(Dispatchers.IO) {
                    verifyWithEMR(encryptedData)
                }

                callback?.onBarcodeScanned(
                    barcodeData,
                    verificationResult.isValid,
                    verificationResult
                )
            } catch (e: Exception) {
                handleScannerError(e)
            }
        }
    }

    private suspend fun verifyWithEMR(encryptedData: EncryptedData): VerificationResult {
        var retryCount = 0
        while (retryCount < MAX_RETRY_ATTEMPTS) {
            try {
                return emrApiClient.verifyBarcode(encryptedData)
                    .await()
            } catch (e: Exception) {
                retryCount++
                if (retryCount >= MAX_RETRY_ATTEMPTS) {
                    throw e
                }
                delay(1000L * retryCount)
            }
        }
        throw RuntimeException("EMR verification failed after $MAX_RETRY_ATTEMPTS attempts")
    }

    private fun setupCameraTimeout() {
        scannerScope.launch {
            delay(SCAN_TIMEOUT_MS)
            if (_scanningState.value == ScanningState.Active) {
                stopScanning()
            }
        }
    }

    private fun handleScannerError(error: Exception) {
        _scanningState.value = ScanningState.Error(error)
        callback?.onError(error)
    }

    interface ScannerCallback {
        fun onBarcodeScanned(
            barcodeData: String,
            isValid: Boolean,
            verificationDetails: VerificationResult
        )
        fun onError(error: Exception)
    }

    sealed class ScanningState {
        object Idle : ScanningState()
        object Starting : ScanningState()
        object Active : ScanningState()
        object Stopping : ScanningState()
        data class Error(val exception: Exception) : ScanningState()
    }

    data class VerificationResult(
        val isValid: Boolean,
        val emrMatchDetails: Map<String, Any>,
        val timestamp: Long,
        val verificationId: String
    )
}