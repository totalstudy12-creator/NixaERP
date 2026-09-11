import { getClient } from './store.js';
import { verifyCodeChallenge, } from './pkce.js';
const MAX_STATE_LENGTH = 2048;
const MAX_SCOPE_COUNT = 20;
const MAX_SCOPE_LENGTH = 100;
function errorResult(error, errorDescription) {
    return {
        valid: false,
        error,
        errorDescription,
    };
}
function isSafeString(value, maxLength) {
    return (value.length > 0 &&
        value.length <= maxLength);
}
function parseScope(rawScope) {
    if (!rawScope) {
        return [];
    }
    const scopes = rawScope
        .split(/\s+/)
        .map((scope) => scope.trim())
        .filter(Boolean);
    if (scopes.length > MAX_SCOPE_COUNT) {
        return null;
    }
    for (const scope of scopes) {
        if (scope.length > MAX_SCOPE_LENGTH) {
            return null;
        }
    }
    return [
        ...new Set(scopes),
    ];
}
/**
 * Validate OAuth authorization request.
 *
 * Required:
 * - client_id
 * - redirect_uri
 * - response_type=code
 * - code_challenge
 * - code_challenge_method=S256
 *
 * Allowed scope:
 * - mcp:read
 */
export function validateAuthorizationRequest(url) {
    const clientId = url.searchParams.get('client_id');
    const redirectUri = url.searchParams.get('redirect_uri');
    const responseType = url.searchParams.get('response_type');
    const rawScope = url.searchParams.get('scope');
    const state = url.searchParams.get('state');
    const codeChallenge = url.searchParams.get('code_challenge');
    const codeChallengeMethod = url.searchParams.get('code_challenge_method');
    /*
     * client_id
     */
    if (!clientId ||
        !isSafeString(clientId, 256)) {
        return errorResult('invalid_request', 'Missing or invalid client_id.');
    }
    /*
     * Client must already be registered.
     *
     * We intentionally do not implement open
     * dynamic client registration here.
     */
    const client = getClient(clientId);
    if (!client) {
        return errorResult('invalid_request', 'Unknown client_id.');
    }
    /*
     * redirect_uri
     */
    if (!redirectUri ||
        !isSafeString(redirectUri, 2048)) {
        return errorResult('invalid_request', 'Missing or invalid redirect_uri.');
    }
    /*
     * Exact redirect URI matching.
     *
     * Never use startsWith(), includes(), or
     * hostname-only comparison.
     */
    if (!client.redirectUris.includes(redirectUri)) {
        return errorResult('invalid_request', 'redirect_uri is not registered for this client.');
    }
    /*
     * response_type
     */
    if (responseType !== 'code') {
        return errorResult('unsupported_response_type', 'Only response_type=code is supported.');
    }
    /*
     * Scope
     */
    const scopes = parseScope(rawScope);
    if (!scopes) {
        return errorResult('invalid_scope', 'Invalid scope value.');
    }
    const unsupportedScopes = scopes.filter((scope) => scope !== 'mcp:read');
    if (unsupportedScopes.length > 0) {
        return errorResult('invalid_scope', 'Only the mcp:read scope is supported.');
    }
    /*
     * state
     */
    if (state !== null &&
        !isSafeString(state, MAX_STATE_LENGTH)) {
        return errorResult('invalid_request', 'Invalid state parameter.');
    }
    /*
     * PKCE is mandatory.
     */
    if (!codeChallenge ||
        !isSafeString(codeChallenge, 256)) {
        return errorResult('invalid_request', 'code_challenge is required.');
    }
    /*
     * Only S256 is accepted.
     */
    if (codeChallengeMethod !== 'S256') {
        return errorResult('invalid_request', 'code_challenge_method must be S256.');
    }
    /*
     * Make sure challenge is structurally
     * valid by verifying it against a generated
     * verifier format.
     *
     * We cannot calculate the challenge without
     * code_verifier here, so we only validate that
     * the supplied challenge has the expected
     * base64url shape.
     */
    const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
    if (!base64UrlPattern.test(codeChallenge)) {
        return errorResult('invalid_request', 'Invalid code_challenge format.');
    }
    /*
     * S256 produces a 43-character base64url
     * encoded SHA-256 value.
     */
    if (codeChallenge.length !== 43) {
        return errorResult('invalid_request', 'Invalid S256 code_challenge length.');
    }
    return {
        valid: true,
        request: {
            clientId,
            redirectUri,
            responseType,
            scope: scopes.length > 0
                ? scopes
                : ['mcp:read'],
            ...(state !== null
                ? { state }
                : {}),
            codeChallenge,
            codeChallengeMethod,
        },
    };
}
/**
 * Helper used by the authorization-code
 * exchange to verify the PKCE verifier.
 */
export function verifyAuthorizationCodePkce(codeVerifier, authorizationRequest) {
    return verifyCodeChallenge(codeVerifier, authorizationRequest.codeChallenge, authorizationRequest.codeChallengeMethod);
}
