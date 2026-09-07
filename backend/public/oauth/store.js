/*
 * --------------------------------------------------------------------------
 * In-memory OAuth storage
 * --------------------------------------------------------------------------
 *
 * Development/testing only.
 *
 * Production should use a shared server-side store such as Redis.
 */
const clients = new Map();
const authorizationCodes = new Map();
/*
 * --------------------------------------------------------------------------
 * Client registration
 * --------------------------------------------------------------------------
 */
export function registerClient(client) {
    clients.set(client.clientId, client);
}
export function getClient(clientId) {
    return clients.get(clientId);
}
/*
 * --------------------------------------------------------------------------
 * Authorization code storage
 * --------------------------------------------------------------------------
 */
export function saveAuthorizationCode(authorizationCode) {
    /*
     * Never overwrite an existing code.
     *
     * Authorization codes should be unpredictable
     * and effectively unique.
     */
    if (authorizationCodes.has(authorizationCode.code)) {
        throw new Error('Authorization code collision detected.');
    }
    authorizationCodes.set(authorizationCode.code, authorizationCode);
}
export function getAuthorizationCode(code) {
    const record = authorizationCodes.get(code);
    if (!record) {
        return undefined;
    }
    /*
     * One-time use.
     */
    if (record.used) {
        authorizationCodes.delete(code);
        return undefined;
    }
    /*
     * Expired code.
     */
    if (Date.now() >=
        record.expiresAt) {
        authorizationCodes.delete(code);
        return undefined;
    }
    return record;
}
export function consumeAuthorizationCode(code) {
    const record = getAuthorizationCode(code);
    if (!record) {
        return undefined;
    }
    /*
     * Mark used before returning.
     *
     * The code is then immediately removed so
     * it cannot be reused.
     */
    record.used = true;
    authorizationCodes.delete(code);
    return record;
}
/*
 * --------------------------------------------------------------------------
 * Cleanup
 * --------------------------------------------------------------------------
 */
export function cleanupAuthorizationCodes() {
    const now = Date.now();
    for (const [code, record,] of authorizationCodes) {
        if (record.used ||
            now >= record.expiresAt) {
            authorizationCodes.delete(code);
        }
    }
}
/*
 * Cleanup every 30 seconds.
 *
 * unref() prevents this timer from keeping the
 * Node.js process alive during shutdown.
 */
const cleanupTimer = setInterval(cleanupAuthorizationCodes, 30_000);
cleanupTimer.unref();
/*
 * --------------------------------------------------------------------------
 * Local development OAuth client
 * --------------------------------------------------------------------------
 *
 * This is ONLY for local/Postman testing.
 *
 * The redirect URI is matched exactly by the
 * authorization-request validator.
 */
registerClient({
    clientId: 'nixaerp-postman-client',
    name: 'NixaERP Postman Test Client',
    redirectUris: [
        'http://127.0.0.1:3001/oauth/callback',
    ],
});
