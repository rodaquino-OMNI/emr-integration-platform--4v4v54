import crypto from 'crypto';
import { logger } from '../logger';

/**
 * Digital signature algorithm
 * RSA-SHA256 provides strong cryptographic signatures
 */
const SIGNATURE_ALGORITHM = 'RSA-SHA256';

/**
 * Key size for RSA key generation (2048-bit minimum for HIPAA)
 */
const KEY_SIZE = 2048;

/**
 * Digital signature result
 */
export interface DigitalSignature {
  signature: string;
  algorithm: string;
  timestamp: string;
  dataHash: string;
}

/**
 * Signature verification result
 */
export interface SignatureVerification {
  valid: boolean;
  algorithm: string;
  timestamp: string;
  error?: string;
}

/**
 * Key pair for digital signatures
 */
export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

/**
 * Digital Signature Service
 * Implements digital signatures for PHI data integrity
 *
 * HIPAA: §164.312(c)(1) - Integrity Controls
 * HIPAA: §164.312(c)(2) - Mechanism to Authenticate ePHI
 *
 * Features:
 * - RSA-2048 or higher signatures
 * - SHA-256 hashing for data integrity
 * - Timestamp inclusion for audit trail
 * - Signature verification with tamper detection
 */
export class DigitalSignatureService {
  private privateKey: string | null = null;
  private publicKey: string | null = null;

  /**
   * Initialize the service with a key pair
   * In production, keys should be stored in secure key management system (Vault, AWS KMS)
   *
   * @param keyPair - Optional key pair to use
   */
  constructor(keyPair?: KeyPair) {
    if (keyPair) {
      this.privateKey = keyPair.privateKey;
      this.publicKey = keyPair.publicKey;
    }
  }

  /**
   * Generate a new RSA key pair for digital signatures
   *
   * @returns Promise resolving to key pair
   */
  public async generateKeyPair(): Promise<KeyPair> {
    return new Promise((resolve, reject) => {
      crypto.generateKeyPair(
        'rsa',
        {
          modulusLength: KEY_SIZE,
          publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
          },
          privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
          }
        },
        (err, publicKey, privateKey) => {
          if (err) {
            logger.error('Failed to generate key pair', { error: err.message });
            reject(err);
            return;
          }

          this.publicKey = publicKey;
          this.privateKey = privateKey;

          logger.info('Digital signature key pair generated', {
            algorithm: SIGNATURE_ALGORITHM,
            keySize: KEY_SIZE
          });

          resolve({ publicKey, privateKey });
        }
      );
    });
  }

  /**
   * Sign data with digital signature
   *
   * @param data - Data to sign (PHI record, audit log entry, etc.)
   * @returns Digital signature with metadata
   * @throws Error if private key not configured
   */
  public sign(data: string | object): DigitalSignature {
    if (!this.privateKey) {
      throw new Error('Private key not configured. Call generateKeyPair() or provide key in constructor.');
    }

    try {
      // Convert object to JSON string
      const dataString = typeof data === 'string' ? data : JSON.stringify(data);

      // Create SHA-256 hash of data
      const dataHash = crypto
        .createHash('sha256')
        .update(dataString)
        .digest('hex');

      // Sign the hash with private key
      const sign = crypto.createSign('sha256');
      sign.update(dataString);
      sign.end();

      const signature = sign.sign(this.privateKey, 'base64');

      const timestamp = new Date().toISOString();

      logger.debug('Data signed successfully', {
        algorithm: SIGNATURE_ALGORITHM,
        dataHashPreview: dataHash.substring(0, 16) + '...',
        timestamp
      });

      return {
        signature,
        algorithm: SIGNATURE_ALGORITHM,
        timestamp,
        dataHash
      };
    } catch (error) {
      logger.error('Failed to sign data', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Verify a digital signature
   *
   * @param data - Original data that was signed
   * @param signatureData - Signature to verify
   * @param publicKey - Optional public key (uses instance key if not provided)
   * @returns Verification result with status and details
   */
  public verify(
    data: string | object,
    signatureData: DigitalSignature,
    publicKey?: string
  ): SignatureVerification {
    const keyToUse = publicKey || this.publicKey;

    if (!keyToUse) {
      logger.error('Public key not available for verification');
      return {
        valid: false,
        algorithm: signatureData.algorithm,
        timestamp: signatureData.timestamp,
        error: 'Public key not configured'
      };
    }

    try {
      // Convert object to JSON string
      const dataString = typeof data === 'string' ? data : JSON.stringify(data);

      // Verify data hash matches
      const currentHash = crypto
        .createHash('sha256')
        .update(dataString)
        .digest('hex');

      if (currentHash !== signatureData.dataHash) {
        logger.warn('Data hash mismatch detected', {
          expected: signatureData.dataHash.substring(0, 16) + '...',
          actual: currentHash.substring(0, 16) + '...'
        });

        return {
          valid: false,
          algorithm: signatureData.algorithm,
          timestamp: signatureData.timestamp,
          error: 'Data has been tampered with (hash mismatch)'
        };
      }

      // Verify signature
      const verify = crypto.createVerify('sha256');
      verify.update(dataString);
      verify.end();

      const valid = verify.verify(keyToUse, signatureData.signature, 'base64');

      if (valid) {
        logger.debug('Signature verified successfully', {
          algorithm: signatureData.algorithm,
          timestamp: signatureData.timestamp
        });
      } else {
        logger.warn('Invalid signature detected', {
          algorithm: signatureData.algorithm,
          timestamp: signatureData.timestamp
        });
      }

      const result: SignatureVerification = {
        valid,
        algorithm: signatureData.algorithm,
        timestamp: signatureData.timestamp
      };

      if (!valid) {
        result.error = 'Invalid signature';
      }

      return result;
    } catch (error) {
      logger.error('Failed to verify signature', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        valid: false,
        algorithm: signatureData.algorithm,
        timestamp: signatureData.timestamp,
        error: error instanceof Error ? error.message : 'Verification failed'
      };
    }
  }

  /**
   * Set the key pair for this service instance
   *
   * @param keyPair - Key pair to use
   */
  public setKeyPair(keyPair: KeyPair): void {
    this.privateKey = keyPair.privateKey;
    this.publicKey = keyPair.publicKey;

    logger.info('Digital signature key pair configured');
  }

  /**
   * Get the public key
   *
   * @returns Public key in PEM format
   */
  public getPublicKey(): string | null {
    return this.publicKey;
  }

  /**
   * Verify data integrity without signature
   * Simple hash-based verification for audit logs
   *
   * @param data - Data to verify
   * @param expectedHash - Expected SHA-256 hash
   * @returns True if hash matches, false otherwise
   */
  public static verifyDataHash(data: string | object, expectedHash: string): boolean {
    const dataString = typeof data === 'string' ? data : JSON.stringify(data);

    const actualHash = crypto
      .createHash('sha256')
      .update(dataString)
      .digest('hex');

    return actualHash === expectedHash;
  }

  /**
   * Calculate SHA-256 hash of data
   *
   * @param data - Data to hash
   * @returns Hexadecimal hash string
   */
  public static calculateHash(data: string | object): string {
    const dataString = typeof data === 'string' ? data : JSON.stringify(data);

    return crypto
      .createHash('sha256')
      .update(dataString)
      .digest('hex');
  }
}

/**
 * Singleton instance for application-wide use
 * In production, initialize with keys from secure key management system
 */
let instance: DigitalSignatureService | null = null;

/**
 * Get or create the singleton digital signature service
 *
 * @returns Digital signature service instance
 */
export function getDigitalSignatureService(): DigitalSignatureService {
  if (!instance) {
    instance = new DigitalSignatureService();

    // Auto-generate key pair on first use
    // In production, load from secure key management system
    instance.generateKeyPair().catch(err => {
      logger.error('Failed to initialize digital signature service', {
        error: err.message
      });
    });
  }

  return instance;
}
