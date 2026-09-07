import { randomBytes } from 'node:crypto';
const ACCESS_TOKEN_TTL_SECONDS = 3600;
const accessTokens = new Map();
function cleanupExpiredTokens() {
    const now = Math.floor(Date.now() / 1000);
    for (const [token, record] of accessTokens) {
        if (record.expiresAt <= now) {
            accessTokens.delete(token);
        }
    }
}
export function generateAccessToken() {
    return randomBytes(32).toString('base64url');
}
export function saveAccessToken(input) {
    cleanupExpiredTokens();
    const token = input.token ??
        generateAccessToken();
    const now = Math.floor(Date.now() / 1000);
    const ttl = input.ttlSeconds ??
        ACCESS_TOKEN_TTL_SECONDS;
    const record = {
        token,
        clientId: input.clientId,
        userId: input.userId,
        scopes: [
            ...new Set(input.scopes),
        ],
        expiresAt: now + ttl,
        createdAt: now,
    };
    accessTokens.set(token, record);
    return record;
}
export function getAccessToken(token) {
    cleanupExpiredTokens();
    const record = accessTokens.get(token);
    if (!record) {
        return null;
    }
    const now = Math.floor(Date.now() / 1000);
    if (record.expiresAt <= now) {
        accessTokens.delete(token);
        return null;
    }
    return {
        ...record,
        scopes: [
            ...record.scopes,
        ],
    };
}
export function revokeAccessToken(token) {
    return accessTokens.delete(token);
}
export function clearAccessTokens() {
    accessTokens.clear();
}
/*
 * Cleanup every 30 seconds.
 *
 * This in-memory store is suitable only for
 * local development / single-process testing.
 */
const cleanupTimer = setInterval(cleanupExpiredTokens, 30_000);
cleanupTimer.unref();
