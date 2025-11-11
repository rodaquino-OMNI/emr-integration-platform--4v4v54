import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { OAuth2TokenManager, OAuth2Config, OAuth2Token } from '../oauth2-token-manager';

describe('OAuth2TokenManager', () => {
  let tokenManager: OAuth2TokenManager;
  let mockAxios: MockAdapter;
  let oauth2Config: OAuth2Config;

  beforeEach(() => {
    tokenManager = new OAuth2TokenManager();
    mockAxios = new MockAdapter(axios);

    oauth2Config = {
      tokenEndpoint: 'https://example.com/oauth2/token',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      scope: 'system/Patient.read system/Task.read',
      grantType: 'client_credentials'
    };
  });

  afterEach(() => {
    mockAxios.reset();
    mockAxios.restore();
    tokenManager.clearCache();
  });

  describe('getAccessToken', () => {
    it('should acquire a new token on first request', async () => {
      // Mock token endpoint response
      mockAxios.onPost('https://example.com/oauth2/token').reply(200, {
        access_token: 'test-access-token-123',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'system/Patient.read system/Task.read'
      });

      const accessToken = await tokenManager.getAccessToken(oauth2Config);

      expect(accessToken).toBe('test-access-token-123');

      // Verify request was made with correct parameters
      const request = mockAxios.history.post[0];
      expect(request.url).toBe('https://example.com/oauth2/token');
      expect(request.headers['Content-Type']).toBe('application/x-www-form-urlencoded');

      const requestBody = new URLSearchParams(request.data);
      expect(requestBody.get('grant_type')).toBe('client_credentials');
      expect(requestBody.get('client_id')).toBe('test-client-id');
      expect(requestBody.get('client_secret')).toBe('test-client-secret');
      expect(requestBody.get('scope')).toBe('system/Patient.read system/Task.read');
    });

    it('should return cached token if still valid', async () => {
      // First request - acquire token
      mockAxios.onPost('https://example.com/oauth2/token').reply(200, {
        access_token: 'cached-token',
        token_type: 'Bearer',
        expires_in: 3600
      });

      const firstToken = await tokenManager.getAccessToken(oauth2Config);
      expect(firstToken).toBe('cached-token');
      expect(mockAxios.history.post.length).toBe(1);

      // Second request - should use cached token
      const secondToken = await tokenManager.getAccessToken(oauth2Config);
      expect(secondToken).toBe('cached-token');
      expect(mockAxios.history.post.length).toBe(1); // No additional request
    });

    it('should refresh token when expired', async () => {
      // First token with very short expiration
      mockAxios.onPost('https://example.com/oauth2/token').replyOnce(200, {
        access_token: 'expired-token',
        token_type: 'Bearer',
        expires_in: 1 // 1 second
      });

      const firstToken = await tokenManager.getAccessToken(oauth2Config);
      expect(firstToken).toBe('expired-token');

      // Wait for token to expire (plus buffer)
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Mock new token
      mockAxios.onPost('https://example.com/oauth2/token').replyOnce(200, {
        access_token: 'refreshed-token',
        token_type: 'Bearer',
        expires_in: 3600
      });

      const secondToken = await tokenManager.getAccessToken(oauth2Config);
      expect(secondToken).toBe('refreshed-token');
      expect(mockAxios.history.post.length).toBe(2);
    });

    it('should handle token acquisition failure', async () => {
      mockAxios.onPost('https://example.com/oauth2/token').reply(401, {
        error: 'invalid_client',
        error_description: 'Client authentication failed'
      });

      await expect(tokenManager.getAccessToken(oauth2Config)).rejects.toThrow(
        'OAuth2 token acquisition failed: Client authentication failed'
      );
    });

    it('should handle network errors', async () => {
      mockAxios.onPost('https://example.com/oauth2/token').networkError();

      await expect(tokenManager.getAccessToken(oauth2Config)).rejects.toThrow();
    });

    it('should not make concurrent requests for same token', async () => {
      mockAxios.onPost('https://example.com/oauth2/token').reply(200, {
        access_token: 'concurrent-test-token',
        token_type: 'Bearer',
        expires_in: 3600
      });

      // Make multiple concurrent requests
      const promises = [
        tokenManager.getAccessToken(oauth2Config),
        tokenManager.getAccessToken(oauth2Config),
        tokenManager.getAccessToken(oauth2Config)
      ];

      const tokens = await Promise.all(promises);

      // All should return same token
      expect(tokens[0]).toBe('concurrent-test-token');
      expect(tokens[1]).toBe('concurrent-test-token');
      expect(tokens[2]).toBe('concurrent-test-token');

      // Only one request should have been made
      expect(mockAxios.history.post.length).toBe(1);
    });

    it('should handle different configs with separate caches', async () => {
      const config1: OAuth2Config = {
        ...oauth2Config,
        clientId: 'client-1'
      };

      const config2: OAuth2Config = {
        ...oauth2Config,
        clientId: 'client-2'
      };

      mockAxios.onPost('https://example.com/oauth2/token').reply((config) => {
        const body = new URLSearchParams(config.data);
        const clientId = body.get('client_id');
        return [200, {
          access_token: `token-for-${clientId}`,
          token_type: 'Bearer',
          expires_in: 3600
        }];
      });

      const token1 = await tokenManager.getAccessToken(config1);
      const token2 = await tokenManager.getAccessToken(config2);

      expect(token1).toBe('token-for-client-1');
      expect(token2).toBe('token-for-client-2');
      expect(mockAxios.history.post.length).toBe(2);
    });
  });

  describe('getAuthorizationHeader', () => {
    it('should return Bearer token in correct format', async () => {
      mockAxios.onPost('https://example.com/oauth2/token').reply(200, {
        access_token: 'test-token-abc',
        token_type: 'Bearer',
        expires_in: 3600
      });

      const authHeader = await tokenManager.getAuthorizationHeader(oauth2Config);

      expect(authHeader).toBe('Bearer test-token-abc');
    });
  });

  describe('clearToken', () => {
    it('should clear specific cached token', async () => {
      mockAxios.onPost('https://example.com/oauth2/token').reply(200, {
        access_token: 'token-to-clear',
        token_type: 'Bearer',
        expires_in: 3600
      });

      // Get token (cached)
      const firstToken = await tokenManager.getAccessToken(oauth2Config);
      expect(firstToken).toBe('token-to-clear');
      expect(mockAxios.history.post.length).toBe(1);

      // Clear cache
      tokenManager.clearToken(oauth2Config);

      // Mock new token
      mockAxios.onPost('https://example.com/oauth2/token').reply(200, {
        access_token: 'new-token-after-clear',
        token_type: 'Bearer',
        expires_in: 3600
      });

      // Get token again (should make new request)
      const secondToken = await tokenManager.getAccessToken(oauth2Config);
      expect(secondToken).toBe('new-token-after-clear');
      expect(mockAxios.history.post.length).toBe(2);
    });
  });

  describe('clearCache', () => {
    it('should clear all cached tokens', async () => {
      const config1 = { ...oauth2Config, clientId: 'client-1' };
      const config2 = { ...oauth2Config, clientId: 'client-2' };

      mockAxios.onPost('https://example.com/oauth2/token').reply(200, {
        access_token: 'test-token',
        token_type: 'Bearer',
        expires_in: 3600
      });

      // Get tokens for both configs
      await tokenManager.getAccessToken(config1);
      await tokenManager.getAccessToken(config2);
      expect(mockAxios.history.post.length).toBe(2);

      // Clear all caches
      tokenManager.clearCache();

      // Get tokens again (should make new requests)
      await tokenManager.getAccessToken(config1);
      await tokenManager.getAccessToken(config2);
      expect(mockAxios.history.post.length).toBe(4);
    });
  });

  describe('Token expiration handling', () => {
    it('should add 60 second buffer to token expiration', async () => {
      mockAxios.onPost('https://example.com/oauth2/token').reply(200, {
        access_token: 'short-lived-token',
        token_type: 'Bearer',
        expires_in: 120 // 2 minutes
      });

      const firstToken = await tokenManager.getAccessToken(oauth2Config);
      expect(firstToken).toBe('short-lived-token');

      // Wait 61 seconds (within expiration but after buffer)
      await new Promise(resolve => setTimeout(resolve, 61000));

      // Mock new token for refresh
      mockAxios.onPost('https://example.com/oauth2/token').reply(200, {
        access_token: 'refreshed-token-after-buffer',
        token_type: 'Bearer',
        expires_in: 3600
      });

      const secondToken = await tokenManager.getAccessToken(oauth2Config);

      // Should have refreshed due to buffer
      expect(secondToken).toBe('refreshed-token-after-buffer');
      expect(mockAxios.history.post.length).toBe(2);
    }, 65000); // Increase test timeout
  });

  describe('RFC 6749 Compliance', () => {
    it('should use application/x-www-form-urlencoded content type', async () => {
      mockAxios.onPost('https://example.com/oauth2/token').reply(200, {
        access_token: 'test-token',
        token_type: 'Bearer',
        expires_in: 3600
      });

      await tokenManager.getAccessToken(oauth2Config);

      const request = mockAxios.history.post[0];
      expect(request.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    });

    it('should include all required parameters for client credentials grant', async () => {
      mockAxios.onPost('https://example.com/oauth2/token').reply(200, {
        access_token: 'test-token',
        token_type: 'Bearer',
        expires_in: 3600
      });

      await tokenManager.getAccessToken(oauth2Config);

      const requestBody = new URLSearchParams(mockAxios.history.post[0].data);

      // Required parameters per RFC 6749 Section 4.4
      expect(requestBody.get('grant_type')).toBe('client_credentials');
      expect(requestBody.get('client_id')).toBeTruthy();
      expect(requestBody.get('client_secret')).toBeTruthy();
    });

    it('should handle optional scope parameter', async () => {
      const configWithoutScope: OAuth2Config = {
        tokenEndpoint: 'https://example.com/oauth2/token',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        grantType: 'client_credentials'
      };

      mockAxios.onPost('https://example.com/oauth2/token').reply(200, {
        access_token: 'test-token',
        token_type: 'Bearer',
        expires_in: 3600
      });

      await tokenManager.getAccessToken(configWithoutScope);

      const requestBody = new URLSearchParams(mockAxios.history.post[0].data);
      expect(requestBody.has('scope')).toBe(false);
    });
  });
});
