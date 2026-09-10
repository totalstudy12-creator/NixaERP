import { consumeAuthorizationCode, getAuthorizationCode, } from './store.js';
import { verifyCodeChallenge, } from './pkce.js';
import { getOAuthIssuer, } from './metadata.js';
import { saveAccessToken, } from './access-token-store.js';
const ACCESS_TOKEN_TTL_SECONDS = 3600;
const MAX_BODY_SIZE = 16 * 1024;
function sendJson(res, statusCode, payload) {
    if (res.headersSent) {
        return;
    }
    res.statusCode =
        statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.end(JSON.stringify(payload));
}
function sendError(res, statusCode, error, description) {
    sendJson(res, statusCode, {
        error,
        error_description: description,
    });
}
function readRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        let completed = false;
        const complete = (callback) => {
            if (completed) {
                return;
            }
            completed =
                true;
            callback();
        };
        req.setEncoding('utf8');
        req.on('data', (chunk) => {
            body += chunk;
            if (Buffer.byteLength(body, 'utf8') > MAX_BODY_SIZE) {
                complete(() => {
                    reject(new Error('Request body too large.'));
                });
                req.destroy();
            }
        });
        req.on('end', () => {
            complete(() => {
                resolve(body);
            });
        });
        req.on('error', (error) => {
            complete(() => {
                reject(error);
            });
        });
        req.on('aborted', () => {
            complete(() => {
                reject(new Error('Request was aborted.'));
            });
        });
    });
}
function parseTokenRequest(body) {
    const params = new URLSearchParams(body);
    return {
        grant_type: params.get('grant_type') ?? undefined,
        code: params.get('code') ?? undefined,
        redirect_uri: params.get('redirect_uri') ?? undefined,
        client_id: params.get('client_id') ?? undefined,
        code_verifier: params.get('code_verifier') ?? undefined,
    };
}
export async function handleToken(req, res) {
    try {
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            sendError(res, 405, 'method_not_allowed', 'Only POST is allowed for the token endpoint.');
            return;
        }
        const rawContentType = req.headers['content-type'];
        const contentTypeHeader = typeof rawContentType ===
            'string'
            ? rawContentType
            : '';
        const contentType = contentTypeHeader
            .split(';', 1)[0]
            ?.trim()
            .toLowerCase() ??
            '';
        if (contentType !==
            'application/x-www-form-urlencoded') {
            sendError(res, 415, 'invalid_request', 'Content-Type must be application/x-www-form-urlencoded.');
            return;
        }
        const rawBody = await readRequestBody(req);
        const tokenRequest = parseTokenRequest(rawBody);
        if (tokenRequest.grant_type !==
            'authorization_code') {
            sendError(res, 400, 'unsupported_grant_type', 'Only the authorization_code grant type is supported.');
            return;
        }
        if (!tokenRequest.code) {
            sendError(res, 400, 'invalid_grant', 'Missing authorization code.');
            return;
        }
        if (!tokenRequest.client_id) {
            sendError(res, 400, 'invalid_grant', 'Missing client_id.');
            return;
        }
        if (!tokenRequest.redirect_uri) {
            sendError(res, 400, 'invalid_grant', 'Missing redirect_uri.');
            return;
        }
        if (!tokenRequest.code_verifier) {
            sendError(res, 400, 'invalid_grant', 'Missing code_verifier.');
            return;
        }
        const authorizationCode = getAuthorizationCode(tokenRequest.code);
        if (!authorizationCode) {
            sendError(res, 400, 'invalid_grant', 'Authorization code is invalid, expired, or already used.');
            return;
        }
        /*
         * Validate OAuth client.
         */
        if (authorizationCode.clientId !==
            tokenRequest.client_id) {
            sendError(res, 400, 'invalid_grant', 'client_id does not match the authorization code.');
            return;
        }
        /*
         * Validate exact redirect URI.
         */
        if (authorizationCode.redirectUri !==
            tokenRequest.redirect_uri) {
            sendError(res, 400, 'invalid_grant', 'redirect_uri does not match the authorization code.');
            return;
        }
        /*
         * Validate issuer.
         */
        const issuer = getOAuthIssuer();
        if (authorizationCode.issuer !==
            issuer) {
            sendError(res, 400, 'invalid_grant', 'Authorization server issuer mismatch.');
            return;
        }
        /*
         * Validate PKCE.
         */
        const pkceValid = verifyCodeChallenge(tokenRequest.code_verifier, authorizationCode.codeChallenge, authorizationCode.codeChallengeMethod);
        if (!pkceValid) {
            sendError(res, 400, 'invalid_grant', 'PKCE verification failed.');
            return;
        }
        /*
         * Consume authorization code
         * only after successful validation.
         */
        const consumed = consumeAuthorizationCode(tokenRequest.code);
        if (!consumed) {
            sendError(res, 400, 'invalid_grant', 'Authorization code is invalid, expired, or already used.');
            return;
        }
        /*
         * Create and persist OAuth
         * access token.
         */
        const accessToken = saveAccessToken({
            clientId: authorizationCode.clientId,
            userId: authorizationCode.userId,
            scopes: authorizationCode.scope,
            ttlSeconds: ACCESS_TOKEN_TTL_SECONDS,
        });
        const response = {
            access_token: accessToken.token,
            token_type: 'Bearer',
            expires_in: Math.max(0, accessToken.expiresAt -
                Math.floor(Date.now() / 1000)),
            scope: accessToken.scopes.join(' '),
        };
        sendJson(res, 200, response);
    }
    catch (error) {
        console.error('[OAuth] Token endpoint error:', error);
        if (!res.headersSent) {
            sendError(res, 500, 'server_error', 'OAuth token request could not be completed.');
        }
    }
}
