import axios, { AxiosInstance } from 'axios';
import { injectable } from 'inversify';

/**
 * OAuth2 Token Interface following RFC 6749
 */
export interface OAuth2Token {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  refresh_token?: string;
  issued_at: number; // Timestamp when token was issued
}

/**
 * OAuth2 Configuration Interface
 */
export interface OAuth2Config {
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
  grantType?: 'client_credentials' | 'authorization_code' | 'refresh_token';
}

/**
 * OAuth2 Token Manager
 * Implements RFC 6749 OAuth 2.0 client credentials flow with token caching and refresh
 *
 * Features:
 * - Automatic token acquisition
 * - Token caching with expiration
 * - Automatic token refresh
 * - Thread-safe token management
 */
@injectable()
export class OAuth2TokenManager {
  private readonly httpClient: AxiosInstance;
  private tokenCache: Map<string, OAuth2Token>;
  private tokenRefreshPromises: Map<string, Promise<OAuth2Token>>;

  constructor() {
    this.httpClient = axios.create({
      timeout: 10000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      }
    });
    this.tokenCache = new Map();
    this.tokenRefreshPromises = new Map();
  }

  /**
   * Get a valid access token, automatically refreshing if expired
   *
   * @param config OAuth2 configuration
   * @returns Valid access token
   */
  public async getAccessToken(config: OAuth2Config): Promise<string> {
    const cacheKey = this.getCacheKey(config);
    const cachedToken = this.tokenCache.get(cacheKey);

    // Return cached token if still valid
    if (cachedToken && this.isTokenValid(cachedToken)) {
      return cachedToken.access_token;
    }

    // Check if token refresh is already in progress
    const existingRefreshPromise = this.tokenRefreshPromises.get(cacheKey);
    if (existingRefreshPromise) {
      const token = await existingRefreshPromise;
      return token.access_token;
    }

    // Acquire new token
    const refreshPromise = this.acquireToken(config);
    this.tokenRefreshPromises.set(cacheKey, refreshPromise);

    try {
      const token = await refreshPromise;
      this.tokenCache.set(cacheKey, token);
      return token.access_token;
    } finally {
      this.tokenRefreshPromises.delete(cacheKey);
    }
  }

  /**
   * Acquire a new OAuth2 token using client credentials flow
   *
   * @param config OAuth2 configuration
   * @returns OAuth2 token
   */
  private async acquireToken(config: OAuth2Config): Promise<OAuth2Token> {
    const grantType = config.grantType || 'client_credentials';

    const requestBody = new URLSearchParams({
      grant_type: grantType,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      ...(config.scope && { scope: config.scope })
    });

    try {
      const response = await this.httpClient.post<Omit<OAuth2Token, 'issued_at'>>(
        config.tokenEndpoint,
        requestBody.toString()
      );

      // Add issued_at timestamp
      const token: OAuth2Token = {
        ...response.data,
        issued_at: Date.now()
      };

      return token;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMessage = error.response?.data?.error_description ||
                           error.response?.data?.error ||
                           error.message;
        throw new Error(`OAuth2 token acquisition failed: ${errorMessage}`);
      }
      throw error;
    }
  }

  /**
   * Check if a token is still valid (not expired)
   * Adds 60 second buffer to account for clock skew
   *
   * @param token OAuth2 token to check
   * @returns True if token is valid
   */
  private isTokenValid(token: OAuth2Token): boolean {
    const expirationTime = token.issued_at + (token.expires_in * 1000);
    const bufferTime = 60 * 1000; // 60 second buffer
    const currentTime = Date.now();

    return currentTime < (expirationTime - bufferTime);
  }

  /**
   * Generate cache key from OAuth2 config
   *
   * @param config OAuth2 configuration
   * @returns Cache key
   */
  private getCacheKey(config: OAuth2Config): string {
    return `${config.tokenEndpoint}:${config.clientId}:${config.scope || 'default'}`;
  }

  /**
   * Clear all cached tokens
   */
  public clearCache(): void {
    this.tokenCache.clear();
    this.tokenRefreshPromises.clear();
  }

  /**
   * Clear a specific cached token
   *
   * @param config OAuth2 configuration
   */
  public clearToken(config: OAuth2Config): void {
    const cacheKey = this.getCacheKey(config);
    this.tokenCache.delete(cacheKey);
    this.tokenRefreshPromises.delete(cacheKey);
  }

  /**
   * Get Authorization header value with Bearer token
   *
   * @param config OAuth2 configuration
   * @returns Authorization header value
   */
  public async getAuthorizationHeader(config: OAuth2Config): Promise<string> {
    const accessToken = await this.getAccessToken(config);
    return `Bearer ${accessToken}`;
  }
}
