import androidx.room.*
import androidx.sqlite.db.SupportSQLiteDatabase
import com.emrtask.app.database.migrations.Migration1to2
import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import net.sqlcipher.database.SQLiteDatabase
import net.sqlcipher.database.SupportFactory
import java.security.MessageDigest
import java.util.concurrent.Executors

/**
 * Room database implementation for EMR Task application providing offline storage capabilities
 * with HIPAA-compliant encryption, CRDT-based synchronization, and comprehensive audit logging.
 *
 * @version Room 2.5.0
 * @version SQLite 2.3.0
 * @version SQLCipher 4.5.0
 * @version Coroutines 1.6.4
 */
@Database(
    entities = [Task::class, AuditLog::class, VectorClock::class],
    version = 2,
    exportSchema = false
)
@TypeConverters(DateConverter::class)
@RequiresOptIn(message = "This database operation requires encryption key")
abstract class OfflineDatabase : RoomDatabase() {

    abstract fun taskDao(): TaskDao
    abstract fun auditLogDao(): AuditLogDao
    abstract fun vectorClockDao(): VectorClockDao

    override fun clearAllTables() {
        withContext(Dispatchers.IO) {
            // Log clear operation in audit log
            auditLogDao().insertAuditLog(
                AuditLog(
                    eventType = "DATABASE_CLEAR",
                    userId = getCurrentUserId(),
                    userRole = getCurrentUserRole(),
                    deviceInfo = getDeviceInfo()
                )
            )

            // Securely clear tables
            super.clearAllTables()
            
            // Reset vector clocks
            vectorClockDao().resetVectorClocks()
            
            // Vacuum database to reclaim space
            query("VACUUM", null)
        }
    }

    companion object {
        @Volatile
        private var INSTANCE: OfflineDatabase? = null
        private const val DATABASE_NAME = "emr_task_db"
        private const val DATABASE_VERSION = 2
        private const val PAGE_SIZE = 4096
        private const val MAX_SIZE = 100 * 1024 * 1024L // 100MB

        fun getInstance(context: Context, encryptionKey: String): OfflineDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: buildDatabase(context, encryptionKey).also { INSTANCE = it }
            }
        }

        private fun buildDatabase(context: Context, encryptionKey: String): OfflineDatabase {
            // Validate encryption key strength
            require(isEncryptionKeyValid(encryptionKey)) { 
                "Encryption key must meet HIPAA security requirements" 
            }

            // Initialize SQLCipher
            SQLiteDatabase.loadLibs(context)
            
            // Create encryption key hash
            val keyHash = MessageDigest.getInstance("SHA-256")
                .digest(encryptionKey.toByteArray())
            
            // Configure SQLCipher factory
            val factory = SupportFactory(keyHash)

            return Room.databaseBuilder(
                context.applicationContext,
                OfflineDatabase::class.java,
                DATABASE_NAME
            )
            .openHelperFactory(factory)
            .addMigrations(Migration1to2())
            .setJournalMode(RoomDatabase.JournalMode.TRUNCATE)
            .enableMultiInstanceInvalidation()
            .setQueryExecutor(Executors.newFixedThreadPool(4))
            .addCallback(object : RoomDatabase.Callback() {
                override fun onCreate(db: SupportSQLiteDatabase) {
                    super.onCreate(db)
                    // Initialize database settings
                    db.apply {
                        execSQL("PRAGMA page_size = $PAGE_SIZE")
                        execSQL("PRAGMA max_page_count = ${MAX_SIZE / PAGE_SIZE}")
                        execSQL("PRAGMA foreign_keys = ON")
                        execSQL("PRAGMA secure_delete = ON")
                        execSQL("PRAGMA journal_size_limit = 1048576") // 1MB journal size
                    }
                }
            })
            .build()
        }

        private fun isEncryptionKeyValid(key: String): Boolean {
            return key.length >= 32 && // Minimum 256-bit key
                   key.matches(Regex(".*[A-Z].*")) && // At least one uppercase
                   key.matches(Regex(".*[a-z].*")) && // At least one lowercase
                   key.matches(Regex(".*[0-9].*")) && // At least one number
                   key.matches(Regex(".*[^A-Za-z0-9].*")) // At least one special character
        }
    }
}