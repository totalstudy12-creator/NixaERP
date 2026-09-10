import { createHash, randomBytes } from 'node:crypto';
const ALLOWED_CODE_CHALLENGE_METHOD = 'S256';
const CODE_VERIFIER_MIN_LENGTH = 43;
const CODE_VERIFIER_MAX_LENGTH = 128;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
export function generateAuthorizationCode() {
    return randomBytes(32).toString('base64url');
}
export function generateCodeVerifier() {
    return randomBytes(32).toString('base64url');
}
export function createCodeChallenge(codeVerifier) {
    validateCodeVerifier(codeVerifier);
    return createHash('sha256')
        .update(codeVerifier, 'utf8')
        .digest('base64url');
}
export function validateCodeVerifier(codeVerifier) {
    if (typeof codeVerifier !== 'string' ||
        codeVerifier.length <
            CODE_VERIFIER_MIN_LENGTH ||
        codeVerifier.length >
            CODE_VERIFIER_MAX_LENGTH) {
        throw new Error('Invalid PKCE code_verifier length.');
    }
    if (!BASE64URL_PATTERN.test(codeVerifier)) {
        throw new Error('Invalid PKCE code_verifier format.');
    }
}
export function verifyCodeChallenge(codeVerifier, codeChallenge, codeChallengeMethod) {
    if (codeChallengeMethod !==
        ALLOWED_CODE_CHALLENGE_METHOD) {
        return false;
    }
    if (typeof codeChallenge !== 'string' ||
        !BASE64URL_PATTERN.test(codeChallenge)) {
        return false;
    }
    try {
        const calculatedChallenge = createCodeChallenge(codeVerifier);
        return calculatedChallenge ===
            codeChallenge;
    }
    catch {
        return false;
    }
}
