"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const oauth2TokenManager_1 = require("../../src/utils/oauth2TokenManager");
const axios_1 = __importDefault(require("axios"));
globals_1.jest.mock('axios');
const mockedAxios = axios_1.default;
(0, globals_1.describe)('OAuth2TokenManager', () => {
    let tokenManager;
    const mockConfig = {
        tokenEndpoint: 'https://auth.example.com/oauth/token',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        scope: 'read write'
    };
    (0, globals_1.beforeEach)(() => {
        globals_1.jest.clearAllMocks();
        tokenManager = new oauth2TokenManager_1.OAuth2TokenManager(mockConfig);
    });
    (0, globals_1.describe)('Token Acquisition', () => {
        (0, globals_1.it)('should acquire access token with client credentials', async () => {
            const mockTokenResponse = {
                data: {
                    access_token: 'test-access-token',
                    token_type: 'Bearer',
                    expires_in: 3600,
                    refresh_token: 'test-refresh-token'
                }
            };
            mockedAxios.post.mockResolvedValue(mockTokenResponse);
            const token = await tokenManager.getAccessToken();
            (0, globals_1.expect)(token).toBe('test-access-token');
            (0, globals_1.expect)(mockedAxios.post).toHaveBeenCalledWith(mockConfig.tokenEndpoint, globals_1.expect.any(String), globals_1.expect.objectContaining({
                headers: globals_1.expect.objectContaining({
                    'Content-Type': 'application/x-www-form-urlencoded'
                })
            }));
        });
        (0, globals_1.it)('should include scope in token request', async () => {
            const mockTokenResponse = {
                data: {
                    access_token: 'scoped-token',
                    expires_in: 3600
                }
            };
            mockedAxios.post.mockResolvedValue(mockTokenResponse);
            await tokenManager.getAccessToken();
            (0, globals_1.expect)(mockedAxios.post).toHaveBeenCalledWith(globals_1.expect.any(String), globals_1.expect.stringContaining('scope=read+write'), globals_1.expect.any(Object));
        });
    });
    (0, globals_1.describe)('Token Caching', () => {
        (0, globals_1.it)('should cache valid tokens', async () => {
            const mockTokenResponse = {
                data: {
                    access_token: 'cached-token',
                    expires_in: 3600
                }
            };
            mockedAxios.post.mockResolvedValue(mockTokenResponse);
            const token1 = await tokenManager.getAccessToken();
            const token2 = await tokenManager.getAccessToken();
            (0, globals_1.expect)(token1).toBe(token2);
            (0, globals_1.expect)(mockedAxios.post).toHaveBeenCalledTimes(1);
        });
        (0, globals_1.it)('should not use expired tokens', async () => {
            const mockTokenResponse1 = {
                data: {
                    access_token: 'expired-token',
                    expires_in: 1 // 1 second
                }
            };
            const mockTokenResponse2 = {
                data: {
                    access_token: 'new-token',
                    expires_in: 3600
                }
            };
            mockedAxios.post
                .mockResolvedValueOnce(mockTokenResponse1)
                .mockResolvedValueOnce(mockTokenResponse2);
            const token1 = await tokenManager.getAccessToken();
            // Wait for token to expire
            await new Promise(resolve => setTimeout(resolve, 1100));
            const token2 = await tokenManager.getAccessToken();
            (0, globals_1.expect)(token1).toBe('expired-token');
            (0, globals_1.expect)(token2).toBe('new-token');
            (0, globals_1.expect)(mockedAxios.post).toHaveBeenCalledTimes(2);
        });
        (0, globals_1.it)('should refresh token before expiration', async () => {
            const mockTokenResponse = {
                data: {
                    access_token: 'refreshed-token',
                    expires_in: 3600
                }
            };
            mockedAxios.post.mockResolvedValue(mockTokenResponse);
            const token = await tokenManager.getAccessToken();
            (0, globals_1.expect)(tokenManager.getTokenExpiryTime()).toBeGreaterThan(Date.now());
        });
    });
    (0, globals_1.describe)('Token Refresh', () => {
        (0, globals_1.it)('should refresh token using refresh token', async () => {
            const initialTokenResponse = {
                data: {
                    access_token: 'initial-token',
                    refresh_token: 'refresh-token-123',
                    expires_in: 1
                }
            };
            const refreshedTokenResponse = {
                data: {
                    access_token: 'refreshed-token',
                    refresh_token: 'new-refresh-token',
                    expires_in: 3600
                }
            };
            mockedAxios.post
                .mockResolvedValueOnce(initialTokenResponse)
                .mockResolvedValueOnce(refreshedTokenResponse);
            await tokenManager.getAccessToken();
            // Wait for token to expire
            await new Promise(resolve => setTimeout(resolve, 1100));
            const newToken = await tokenManager.getAccessToken();
            (0, globals_1.expect)(newToken).toBe('refreshed-token');
            (0, globals_1.expect)(mockedAxios.post).toHaveBeenCalledTimes(2);
        });
        (0, globals_1.it)('should handle refresh token expiration', async () => {
            mockedAxios.post
                .mockResolvedValueOnce({
                data: { access_token: 'token1', refresh_token: 'refresh1', expires_in: 1 }
            })
                .mockRejectedValueOnce({
                response: { status: 400, data: { error: 'invalid_grant' } }
            })
                .mockResolvedValueOnce({
                data: { access_token: 'token2', expires_in: 3600 }
            });
            await tokenManager.getAccessToken();
            await new Promise(resolve => setTimeout(resolve, 1100));
            const newToken = await tokenManager.getAccessToken();
            (0, globals_1.expect)(newToken).toBe('token2');
        });
    });
    (0, globals_1.describe)('Error Handling', () => {
        (0, globals_1.it)('should handle network errors', async () => {
            mockedAxios.post.mockRejectedValue(new Error('Network error'));
            await (0, globals_1.expect)(tokenManager.getAccessToken()).rejects.toThrow('Network error');
        });
        (0, globals_1.it)('should handle invalid credentials', async () => {
            mockedAxios.post.mockRejectedValue({
                response: {
                    status: 401,
                    data: { error: 'invalid_client' }
                }
            });
            await (0, globals_1.expect)(tokenManager.getAccessToken()).rejects.toThrow();
        });
        (0, globals_1.it)('should retry on transient failures', async () => {
            mockedAxios.post
                .mockRejectedValueOnce(new Error('Temporary failure'))
                .mockResolvedValueOnce({
                data: { access_token: 'success-token', expires_in: 3600 }
            });
            const token = await tokenManager.getAccessToken();
            (0, globals_1.expect)(token).toBe('success-token');
            (0, globals_1.expect)(mockedAxios.post).toHaveBeenCalledTimes(2);
        });
    });
    (0, globals_1.describe)('Token Validation', () => {
        (0, globals_1.it)('should validate token format', () => {
            const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
            const isValid = tokenManager.validateTokenFormat(validToken);
            (0, globals_1.expect)(isValid).toBe(true);
        });
        (0, globals_1.it)('should reject invalid token format', () => {
            const invalidToken = 'invalid-token';
            const isValid = tokenManager.validateTokenFormat(invalidToken);
            (0, globals_1.expect)(isValid).toBe(false);
        });
    });
    (0, globals_1.describe)('Token Revocation', () => {
        (0, globals_1.it)('should revoke access token', async () => {
            mockedAxios.post.mockResolvedValue({ status: 200 });
            await tokenManager.revokeToken('test-token');
            (0, globals_1.expect)(mockedAxios.post).toHaveBeenCalledWith(globals_1.expect.stringContaining('/revoke'), globals_1.expect.any(String), globals_1.expect.any(Object));
        });
        (0, globals_1.it)('should clear cached token after revocation', async () => {
            const mockTokenResponse = {
                data: {
                    access_token: 'token-to-revoke',
                    expires_in: 3600
                }
            };
            mockedAxios.post.mockResolvedValue(mockTokenResponse);
            await tokenManager.getAccessToken();
            mockedAxios.post.mockResolvedValue({ status: 200 });
            await tokenManager.revokeToken('token-to-revoke');
            mockedAxios.post.mockResolvedValue({
                data: { access_token: 'new-token', expires_in: 3600 }
            });
            const newToken = await tokenManager.getAccessToken();
            (0, globals_1.expect)(newToken).toBe('new-token');
        });
    });
    (0, globals_1.describe)('Multiple Token Management', () => {
        (0, globals_1.it)('should manage tokens for multiple services', async () => {
            const service1Config = { ...mockConfig, scope: 'service1' };
            const service2Config = { ...mockConfig, scope: 'service2' };
            const manager1 = new oauth2TokenManager_1.OAuth2TokenManager(service1Config);
            const manager2 = new oauth2TokenManager_1.OAuth2TokenManager(service2Config);
            mockedAxios.post
                .mockResolvedValueOnce({
                data: { access_token: 'service1-token', expires_in: 3600 }
            })
                .mockResolvedValueOnce({
                data: { access_token: 'service2-token', expires_in: 3600 }
            });
            const token1 = await manager1.getAccessToken();
            const token2 = await manager2.getAccessToken();
            (0, globals_1.expect)(token1).toBe('service1-token');
            (0, globals_1.expect)(token2).toBe('service2-token');
        });
    });
});
//# sourceMappingURL=oauth2TokenManager.test.js.map