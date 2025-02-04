# EMR Task Management Application ProGuard Rules
# Version: 1.0
# HIPAA Compliant Configuration

# General Rules
-keepattributes Signature
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
-optimizations !code/simplification/arithmetic,!code/simplification/cast,!field/*,!class/merging/*
-keepattributes InnerClasses
-keepattributes EnclosingMethod

# Security Module Rules
-keep class com.emrtask.app.security.EncryptionModule { *; }
-keep class com.emrtask.app.security.BiometricModule { *; }
-keep class com.emrtask.app.security.HIPAACompliance { *; }
-keep class com.emrtask.app.security.DataProtection { *; }
-keepclassmembers class * extends javax.crypto.SecretKey { *; }
-keepclassmembers class * extends java.security.KeyStore { *; }
-keepclassmembers class * extends javax.crypto.Cipher { *; }

# Healthcare Data Protection Rules
-keep class com.emrtask.app.emr.** { *; }
-keep class com.emrtask.app.patient.** { *; }
-keep class com.emrtask.app.hipaa.** { *; }
-keepclassmembers class * extends com.emrtask.app.emr.EMRData { *; }
-keepclassmembers class * extends com.emrtask.app.patient.PatientData { *; }

# Database Rules (Room v2.5.0)
-keep class com.emrtask.app.database.OfflineDatabase { *; }
-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class *
-keep @androidx.room.Dao interface *
-keepclassmembers class * extends androidx.room.RoomDatabase
-keepclassmembers @androidx.room.Entity class * { *; }

# Network Rules (Retrofit v2.9.0)
-keepclassmembers,allowobfuscation class * { @retrofit2.http.* <methods>; }
-keepclasseswithmembers class * { @retrofit2.http.* <methods>; }
-dontwarn retrofit2.**
-dontwarn okhttp3.**
-dontwarn okio.**
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# Kotlin and Coroutines Rules (v1.7.0)
-keep class kotlin.** { *; }
-keep class kotlin.Metadata { *; }
-keep class kotlinx.coroutines.** { *; }
-keepclassmembers class * { @kotlin.Metadata <methods>; }
-keepclassmembernames class kotlinx.** { volatile <fields>; }
-dontwarn kotlinx.coroutines.**

# Firebase Messaging Rules (v23.1.2)
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**
-keepattributes *Annotation*

# Barcode Scanner Rules
-keep class com.emrtask.app.barcode.** { *; }
-keep class com.google.mlkit.** { *; }
-dontwarn com.google.mlkit.**
-keepclassmembers class com.emrtask.app.barcode.Scanner { *; }
-keepclassmembers class com.emrtask.app.barcode.Verification { *; }

# Model Classes Rules
-keep class com.emrtask.app.models.** { *; }
-keepclassmembers class com.emrtask.app.models.** { *; }
-keepnames class com.emrtask.app.models.**
-keepclassmembers class * implements android.os.Parcelable { *; }

# EMR Integration Classes
-keep class com.emrtask.app.emr.** { *; }
-keepclassmembers class com.emrtask.app.emr.** { *; }
-keepnames class com.emrtask.app.emr.**

# HIPAA Compliance Classes
-keep class com.emrtask.app.hipaa.** { *; }
-keepclassmembers class com.emrtask.app.hipaa.** { *; }
-keepnames class com.emrtask.app.hipaa.**

# Encryption Classes
-keep class com.emrtask.app.security.** { *; }
-keepclassmembers class com.emrtask.app.security.** { *; }
-keepnames class com.emrtask.app.security.**

# Database Classes
-keep class com.emrtask.app.database.** { *; }
-keepclassmembers class com.emrtask.app.database.** { *; }
-keepnames class com.emrtask.app.database.**

# Stack Trace Preservation for Error Reporting
-keepattributes LineNumberTable,SourceFile
-renamesourcefileattribute SourceFile

# Preserve Debugging Information for Development
-keepattributes LocalVariableTable,LocalVariableTypeTable

# Preserve Annotations for Runtime Processing
-keepattributes RuntimeVisible*Annotations
-keepattributes AnnotationDefault

# Additional Security Measures
-allowaccessmodification
-repackageclasses 'com.emrtask.app'
-flattenpackagehierarchy 'com.emrtask.app'