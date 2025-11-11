import axios, { AxiosInstance } from 'axios'; // v1.4.0
import { Logger } from '../logger';
import { trace, Span, SpanStatusCode } from '@opentelemetry/api'; // v1.4.0

/**
 * OAuth2 Token Response Interface
 */
export interface OAuth2TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  refresh_token?: string;
}

/**
 * Cached Token Interface with expiry tracking
 */
interface CachedToken {
  accessToken: string;
  tokenType: string;
  expiresAt: number; // Unix timestamp in milliseconds
  scope?: string;
  refreshToken?: string;
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
  audience?: string; // For SMART-on-FHIR
  resource?: string; // For Epic/Cerner specific flows
}

/**
 * SMART-on-FHIR Configuration Interface
 */
export interface SmartOnFhirConfig extends OAuth2Config {
  fhirBaseUrl: string;
  redirectUri?: string;
  launchToken?: string;
  aud: string; // FHIR server URL
}

/**
 * OAuth2 Token Manager
 *
 * Handles OAuth2 token acquisition, caching, and automatic refresh
 * Supports SMART-on-FHIR for Epic and Cerner integrations
 *
 * Features:
 * - Token caching with expiry tracking
 * - Automatic token refresh (5 minutes before expiry)
 * - Retry logic with exponential backoff
 * - SMART-on-FHIR support
 * - Thread-safe token acquisition
 * - Comprehensive error handling
 */
export class OAuth2TokenManager {
  private readonly httpClient: AxiosInstance;
  private readonly logger: Logger;
  private readonly tracer = trace.getTracer('oauth2-token-manager');
  private readonly tokenCache: Map<string, CachedToken> = new Map();
  private readonly pendingTokenRequests: Map<string, Promise<string>> = new Map();

  // Token refresh margin: refresh 5 minutes before expiry
  private readonly TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

  // Maximum retry attempts
  private readonly MAX_RETRY_ATTEMPTS = 3;

  // Base retry delay in milliseconds
  private readonly BASE_RETRY_DELAY_MS = 1000;

  constructor(logger?: Logger) {
    this.logger = logger || console as any;
    this.httpClient = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      }
    });
  }

  /**
   * Get access token with automatic caching and refresh
   *
   * @param config OAuth2 configuration
   * @param forceRefresh Force token refresh even if cached token is valid
   * @returns Access token string
   */
  public async getAccessToken(
    config: OAuth2Config,
    forceRefresh: boolean = false
  ): Promise<string> {
    const span = this.tracer.startSpan('getAccessToken');

    try {
      const cacheKey = this.generateCacheKey(config);

      // Check if there's already a pending request for this token
      const pendingRequest = this.pendingTokenRequests.get(cacheKey);
      if (pendingRequest) {
        this.logger.debug('Waiting for pending token request', { cacheKey });
        return await pendingRequest;
      }

      // Check cache if not forcing refresh
      if (!forceRefresh) {
        const cachedToken = this.getCachedToken(cacheKey);
        if (cachedToken) {
          span.setAttribute('cached', true);
          span.setStatus({ code: SpanStatusCode.OK });
          return cachedToken;
        }
      }

      // Create new token request promise
      const tokenPromise = this.acquireNewToken(config, cacheKey);
      this.pendingTokenRequests.set(cacheKey, tokenPromise);

      try {
        const token = await tokenPromise;
        span.setAttribute('cached', false);
        span.setStatus({ code: SpanStatusCode.OK });
        return token;
      } finally {
        this.pendingTokenRequests.delete(cacheKey);
      }

    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      this.logger.error('Failed to get access token', { error });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Get access token for SMART-on-FHIR flow
   *
   * @param config SMART-on-FHIR configuration
   * @returns Access token string
   */
  public async getSmartOnFhirToken(config: SmartOnFhirConfig): Promise<string> {
    const span = this.tracer.startSpan('getSmartOnFhirToken');

    try {
      // SMART-on-FHIR requires audience parameter
      const oauth2Config: OAuth2Config = {
        ...config,
        audience: config.aud,
        scope: config.scope || 'patient/*.read launch/patient'
      };

      return await this.getAccessToken(oauth2Config);

    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Refresh an existing token using refresh token
   *
   * @param config OAuth2 configuration
   * @param refreshToken Refresh token
   * @returns New access token string
   */
  public async refreshToken(
    config: OAuth2Config,
    refreshToken: string
  ): Promise<string> {
    const span = this.tracer.startSpan('refreshToken');

    try {
      const refreshConfig: OAuth2Config = {
        ...config,
        grantType: 'refresh_token'
      };

      const tokenResponse = await this.requestToken(refreshConfig, {
        refresh_token: refreshToken
      });

      const cacheKey = this.generateCacheKey(config);
      this.cacheToken(cacheKey, tokenResponse);

      span.setStatus({ code: SpanStatusCode.OK });
      return tokenResponse.access_token;

    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      this.logger.error('Failed to refresh token', { error });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Clear cached token for a specific configuration
   *
   * @param config OAuth2 configuration
   */
  public clearCachedToken(config: OAuth2Config): void {
    const cacheKey = this.generateCacheKey(config);
    this.tokenCache.delete(cacheKey);
    this.logger.debug('Cleared cached token', { cacheKey });
  }

  /**
   * Clear all cached tokens
   */
  public clearAllCachedTokens(): void {
    this.tokenCache.clear();
    this.logger.info('Cleared all cached tokens');
  }

  /**
   * Acquire new token from OAuth2 server
   */
  private async acquireNewToken(
    config: OAuth2Config,
    cacheKey: string
  ): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        this.logger.debug('Acquiring new token', { attempt, cacheKey });

        const tokenResponse = await this.requestToken(config);
        this.cacheToken(cacheKey, tokenResponse);

        this.logger.info('Successfully acquired new token', {
          cacheKey,
          expiresIn: tokenResponse.expires_in,
          scope: tokenResponse.scope
        });

        return tokenResponse.access_token;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        if (attempt < this.MAX_RETRY_ATTEMPTS) {
          const delay = this.BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          this.logger.warn('Token acquisition failed, retrying', {
            attempt,
            delay,
            error: lastError.message
          });
          await this.sleep(delay);
        }
      }
    }

    throw new Error(`Failed to acquire token after ${this.MAX_RETRY_ATTEMPTS} attempts: ${lastError?.message}`);
  }

  /**
   * Request token from OAuth2 server
   */
  private async requestToken(
    config: OAuth2Config,
    additionalParams: Record<string, string> = {}
  ): Promise<OAuth2TokenResponse> {
    const grantType = config.grantType || 'client_credentials';

    const params: Record<string, string> = {
      grant_type: grantType,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      ...additionalParams
    };

    // Add scope if provided
    if (config.scope) {
      params.scope = config.scope;
    }

    // Add audience if provided (SMART-on-FHIR)
    if (config.audience) {
      params.audience = config.audience;
    }

    // Add resource if provided (Epic/Cerner specific)
    if (config.resource) {
      params.resource = config.resource;
    }

    try {
      const response = await this.httpClient.post<OAuth2TokenResponse>(
        config.tokenEndpoint,
        new URLSearchParams(params).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      if (!response.data.access_token) {
        throw new Error('Invalid token response: missing access_token');
      }

      return response.data;

    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const data = error.response?.data;

        throw new Error(
          `OAuth2 token request failed: ${status} - ${JSON.stringify(data)}`
        );
      }
      throw error;
    }
  }

  /**
   * Cache token with expiry tracking
   */
  private cacheToken(cacheKey: string, tokenResponse: OAuth2TokenResponse): void {
    const now = Date.now();
    const expiresInMs = tokenResponse.expires_in * 1000;
    const expiresAt = now + expiresInMs;

    const cachedToken: CachedToken = {
      accessToken: tokenResponse.access_token,
      tokenType: tokenResponse.token_type,
      expiresAt,
      scope: tokenResponse.scope,
      refreshToken: tokenResponse.refresh_token
    };

    this.tokenCache.set(cacheKey, cachedToken);

    this.logger.debug('Cached token', {
      cacheKey,
      expiresAt: new Date(expiresAt).toISOString(),
      expiresIn: tokenResponse.expires_in
    });
  }

  /**
   * Get cached token if valid
   */
  private getCachedToken(cacheKey: string): string | null {
    const cachedToken = this.tokenCache.get(cacheKey);

    if (!cachedToken) {
      return null;
    }

    const now = Date.now();
    const timeUntilExpiry = cachedToken.expiresAt - now;

    // Return cached token if it's not expiring soon
    if (timeUntilExpiry > this.TOKEN_REFRESH_MARGIN_MS) {
      this.logger.debug('Using cached token', {
        cacheKey,
        timeUntilExpiry: Math.floor(timeUntilExpiry / 1000)
      });
      return cachedToken.accessToken;
    }

    // Token is expiring soon, remove from cache
    this.tokenCache.delete(cacheKey);
    this.logger.debug('Cached token expiring soon, will refresh', { cacheKey });
    return null;
  }

  /**
   * Generate cache key from OAuth2 configuration
   */
  private generateCacheKey(config: OAuth2Config): string {
    const parts = [
      config.tokenEndpoint,
      config.clientId,
      config.scope || '',
      config.audience || '',
      config.resource || ''
    ];

    return parts.join('::');
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get token info for debugging (without exposing the token)
   */
  public getTokenInfo(config: OAuth2Config): {
    cached: boolean;
    expiresAt?: string;
    timeUntilExpiry?: number;
  } {
    const cacheKey = this.generateCacheKey(config);
    const cachedToken = this.tokenCache.get(cacheKey);

    if (!cachedToken) {
      return { cached: false };
    }

    const now = Date.now();
    const timeUntilExpiry = cachedToken.expiresAt - now;

    return {
      cached: true,
      expiresAt: new Date(cachedToken.expiresAt).toISOString(),
      timeUntilExpiry: Math.floor(timeUntilExpiry / 1000)
    };
  }
}

export default OAuth2TokenManager;
