import { error, info } from '../logger';
import {
  KMSClient,
  EncryptCommand,
  DecryptCommand,
  GenerateDataKeyCommand
} from '@aws-sdk/client-kms';
import * as crypto from 'crypto';
import { env } from '../config';

// Constants for encryption configuration
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_ROTATION_INTERVAL = 86400000; // 24 hours
const RETRY_ATTEMPTS = 3;

// Reserved constants for future key lifecycle management:
// KEY_LENGTH = 32 (AES-256 key size)
// MAX_KEY_AGE = 7776000000 (90 days)
// KEY_CACHE_TTL = 3600000 (1 hour)

// Types
interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
}

interface EncryptionOptions {
  additionalAuthData?: Buffer;
  keyVersion?: string;
}

interface DecryptionOptions {
  additionalAuthData?: Buffer;
}

interface KeyMaterial {
  plaintext: Buffer;
  encrypted: Buffer;
  version: string;
}

interface CachedKey {
  key: Buffer;
  timestamp: number;
  version: string;
}

export class EncryptionService {
  private kmsClient: KMSClient;
  private keyId: string;
  private keyCache: Map<string, CachedKey>;

  constructor(keyId: string, retryConfig: RetryConfig = { maxAttempts: RETRY_ATTEMPTS, baseDelay: 100 }) {
    this.kmsClient = new KMSClient(
      env.awsRegion ? { maxAttempts: retryConfig.maxAttempts, region: env.awsRegion } : { maxAttempts: retryConfig.maxAttempts }
    );
    this.keyId = keyId;
    this.keyCache = new Map();

    // Setup key rotation interval
    setInterval(() => this.rotateKey(), KEY_ROTATION_INTERVAL);
  }

  async encryptWithKMS(data: Buffer): Promise<Buffer> {
    try {
      const command = new EncryptCommand({
        KeyId: this.keyId,
        Plaintext: data
      });

      const response = await this.kmsClient.send(command);
      if (!response.CiphertextBlob) {
        throw new Error('KMS encryption failed: No ciphertext returned');
      }

      info('KMS encryption successful', { keyId: this.keyId });
      return Buffer.from(response.CiphertextBlob);
    } catch (err) {
      error('KMS encryption failed', { error: err, keyId: this.keyId });
      throw err;
    }
  }

  async decryptWithKMS(encryptedData: Buffer): Promise<Buffer> {
    try {
      const command = new DecryptCommand({
        KeyId: this.keyId,
        CiphertextBlob: encryptedData
      });

      const response = await this.kmsClient.send(command);
      if (!response.Plaintext) {
        throw new Error('KMS decryption failed: No plaintext returned');
      }

      info('KMS decryption successful', { keyId: this.keyId });
      return Buffer.from(response.Plaintext);
    } catch (err) {
      error('KMS decryption failed', { error: err, keyId: this.keyId });
      throw err;
    }
  }

  async rotateKey(): Promise<void> {
    try {
      const command = new GenerateDataKeyCommand({
        KeyId: this.keyId,
        KeySpec: 'AES_256'
      });

      const response = await this.kmsClient.send(command);
      if (!response.Plaintext || !response.CiphertextBlob) {
        throw new Error('Key rotation failed: Invalid KMS response');
      }

      const version = crypto.randomBytes(16).toString('hex');
      this.keyCache.clear();
      
      info('Key rotation completed successfully', { 
        keyId: this.keyId, 
        version, 
        timestamp: new Date().toISOString() 
      });
    } catch (err) {
      error('Key rotation failed', { error: err, keyId: this.keyId });
      throw err;
    }
  }
}

export async function encryptField(
  data: string | Buffer,
  key: Buffer,
  options: EncryptionOptions = {}
): Promise<string> {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const plaintext = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
    if (options.additionalAuthData) {
      cipher.setAAD(options.additionalAuthData);
    }

    const encrypted = Buffer.concat([
      cipher.update(plaintext),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();

    // Combine IV, encrypted data, and auth tag
    const combined = Buffer.concat([
      iv,
      encrypted,
      authTag,
      options.keyVersion ? Buffer.from(options.keyVersion) : Buffer.alloc(0)
    ]);

    info('Field encryption successful', { keyVersion: options.keyVersion });
    return combined.toString('base64');
  } catch (err) {
    error('Field encryption failed', { error: err });
    throw err;
  }
}

export async function decryptField(
  encryptedData: string,
  key: Buffer,
  options: DecryptionOptions = {}
): Promise<string> {
  try {
    const combined = Buffer.from(encryptedData, 'base64');

    // Extract components
    const iv = combined.slice(0, IV_LENGTH);
    const aadLength = options.additionalAuthData?.length ?? 0;
    const authTag = combined.slice(-AUTH_TAG_LENGTH - aadLength, -aadLength || undefined);
    const encrypted = combined.slice(IV_LENGTH, -AUTH_TAG_LENGTH - aadLength);

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    if (options.additionalAuthData) {
      decipher.setAAD(options.additionalAuthData);
    }

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);

    info('Field decryption successful');
    return decrypted.toString('utf8');
  } catch (err) {
    error('Field decryption failed', { error: err });
    throw err;
  }
}

export async function generateEncryptionKey(
  options: { version?: string } = {}
): Promise<KeyMaterial> {
  try {
    const version = options.version || crypto.randomBytes(16).toString('hex');

    const kmsClient = new KMSClient(env.awsRegion ? { region: env.awsRegion } : {});
    const command = new GenerateDataKeyCommand({
      KeyId: env.kmsKeyId,
      KeySpec: 'AES_256'
    });

    const response = await kmsClient.send(command);
    if (!response.CiphertextBlob || !response.Plaintext) {
      throw new Error('Failed to generate encryption key');
    }

    info('Encryption key generated successfully', { version });
    return {
      plaintext: Buffer.from(response.Plaintext),
      encrypted: Buffer.from(response.CiphertextBlob),
      version
    };
  } catch (err) {
    error('Failed to generate encryption key', { error: err });
    throw err;
  }
}