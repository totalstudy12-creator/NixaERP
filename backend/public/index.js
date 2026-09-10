import { createServer } from 'node:http';
import { requireBearerAuth, } from '@modelcontextprotocol/server';
import { config } from './config.js';
import { nixaerpTokenVerifier } from './auth.js';
import { mcpHandler } from './server.js';
import { getOAuthAuthorizationServerMetadata, } from './oauth/metadata.js';
import { handleAuthorize, } from './oauth/authorize-handler.js';
import { handleLogin, } from './oauth/login-handler.js';
import { handleConsent, } from './oauth/consent-handler.js';
import { handleToken, } from './oauth/token-handler.js';
/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
*/
const MCP_PATH = '/mcp';
const HEALTH_PATH = '/health';
const PROTECTED_RESOURCE_METADATA_PATH = '/.well-known/oauth-protected-resource';
const AUTHORIZATION_SERVER_METADATA_PATH = '/.well-known/oauth-authorization-server';
const AUTHORIZE_PATH = '/oauth/authorize';
const LOGIN_PATH = '/oauth/login';
const CONSENT_PATH = '/oauth/consent';
const TOKEN_PATH = '/oauth/token';
const REQUIRED_SCOPE = 'mcp:read';
/*
|--------------------------------------------------------------------------
| Request Limits
|--------------------------------------------------------------------------
*/
const MAX_REQUEST_BODY_SIZE = 2 * 1024 * 1024;
/*
|--------------------------------------------------------------------------
| Bearer Authentication
|--------------------------------------------------------------------------
*/
const bearerAuth = requireBearerAuth({
    verifier: nixaerpTokenVerifier,
    requiredScopes: [
        REQUIRED_SCOPE,
    ],
    resourceMetadataUrl: `${config.mcpPublicUrl}` +
        `${PROTECTED_RESOURCE_METADATA_PATH}`,
});
/*
|--------------------------------------------------------------------------
| Request URL
|--------------------------------------------------------------------------
*/
function getRequestUrl(req) {
    const host = req.headers.host ??
        `${config.host}:${config.port}`;
    const forwardedProto = req.headers['x-forwarded-proto'];
    let protocol = 'http';
    if (typeof forwardedProto ===
        'string' &&
        forwardedProto.trim().length > 0) {
        const firstProtocol = forwardedProto
            .split(',')[0]
            ?.trim();
        if (firstProtocol) {
            protocol =
                firstProtocol;
        }
    }
    return new URL(req.url ?? '/', `${protocol}://${host}`);
}
/*
|--------------------------------------------------------------------------
| Node Headers -> Web Headers
|--------------------------------------------------------------------------
*/
function buildHeaders(req) {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
        if (value === undefined) {
            continue;
        }
        if (Array.isArray(value)) {
            headers.set(key, value.join(', '));
            continue;
        }
        headers.set(key, value);
    }
    /*
     * MCP Streamable HTTP clients may
     * request JSON and/or SSE.
     */
    if (req.method === 'POST' &&
        (req.url ?? '')
            .startsWith(MCP_PATH)) {
        headers.set('accept', 'application/json, text/event-stream');
    }
    return headers;
}
/*
|--------------------------------------------------------------------------
| Request Body Reader
|--------------------------------------------------------------------------
*/
async function getRequestBody(req) {
    if (req.method === 'GET' ||
        req.method === 'HEAD') {
        return '';
    }
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
            if (Buffer.byteLength(body, 'utf8') >
                MAX_REQUEST_BODY_SIZE) {
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
/*
|--------------------------------------------------------------------------
| Node Request -> Web Request
|--------------------------------------------------------------------------
*/
async function toWebRequest(req) {
    const url = getRequestUrl(req);
    const headers = buildHeaders(req);
    const method = req.method ?? 'GET';
    if (method === 'GET' ||
        method === 'HEAD') {
        return new Request(url, {
            method,
            headers,
        });
    }
    const body = await getRequestBody(req);
    return new Request(url, {
        method,
        headers,
        body,
    });
}
/*
|--------------------------------------------------------------------------
| JSON Response
|--------------------------------------------------------------------------
*/
function sendJson(res, statusCode, payload) {
    if (res.headersSent) {
        return;
    }
    res.statusCode =
        statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(JSON.stringify(payload));
}
/*
|--------------------------------------------------------------------------
| Web Response -> Node Response
|--------------------------------------------------------------------------
*/
async function sendWebResponse(res, response) {
    if (res.headersSent) {
        return;
    }
    res.statusCode =
        response.status;
    response.headers.forEach((value, key) => {
        res.setHeader(key, value);
    });
    if (!response.body) {
        res.end();
        return;
    }
    const reader = response.body.getReader();
    try {
        while (true) {
            const result = await reader.read();
            if (result.done) {
                break;
            }
            if (result.value) {
                res.write(Buffer.from(result.value));
            }
        }
        if (!res.writableEnded) {
            res.end();
        }
    }
    catch (error) {
        console.error('[HTTP] Response streaming error:', error);
        if (!res.writableEnded) {
            res.end();
        }
    }
    finally {
        reader.releaseLock();
    }
}
function sendAuthorizeResult(res, result) {
    if (res.headersSent) {
        return;
    }
    res.statusCode =
        result.status;
    if (result.headers) {
        for (const [key, value] of Object.entries(result.headers)) {
            res.setHeader(key, value);
        }
    }
    res.end(result.body);
}
/*
|--------------------------------------------------------------------------
| Security Headers
|--------------------------------------------------------------------------
*/
function sendSecurityHeaders(res) {
    if (res.headersSent) {
        return;
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
}
/*
|--------------------------------------------------------------------------
| Error Responses
|--------------------------------------------------------------------------
*/
function sendNotFound(res) {
    sendJson(res, 404, {
        success: false,
        error: 'Not found.',
    });
}
function sendMethodNotAllowed(res, allow) {
    if (!res.headersSent) {
        res.setHeader('Allow', allow);
    }
    sendJson(res, 405, {
        success: false,
        error: 'Method not allowed.',
    });
}
/*
|--------------------------------------------------------------------------
| Protected MCP
|--------------------------------------------------------------------------
*/
async function handleProtectedMcp(req, res) {
    try {
        const request = await toWebRequest(req);
        const authResult = await bearerAuth(request);
        if (authResult instanceof Response) {
            await sendWebResponse(res, authResult);
            return;
        }
        const response = await mcpHandler.fetch(request, {
            authInfo: authResult,
        });
        await sendWebResponse(res, response);
    }
    catch (error) {
        console.error('[MCP] Protected request failed:', error);
        if (!res.headersSent) {
            sendJson(res, 500, {
                success: false,
                error: 'MCP request could not be processed.',
            });
        }
    }
}
/*
|--------------------------------------------------------------------------
| HTTP Server
|--------------------------------------------------------------------------
*/
const server = createServer(async (req, res) => {
    const method = req.method ?? 'GET';
    const url = getRequestUrl(req);
    console.log(`[HTTP] ${method} ${url.pathname}`);
    sendSecurityHeaders(res);
    try {
        /*
        |--------------------------------------------------------------------------
        | Health
        |--------------------------------------------------------------------------
        */
        if (url.pathname ===
            HEALTH_PATH) {
            if (method !== 'GET') {
                sendMethodNotAllowed(res, 'GET');
                return;
            }
            sendJson(res, 200, {
                success: true,
                service: 'nixaerp-mcp',
                status: 'ok',
                version: '1.0.0',
                environment: config.nodeEnv,
                timestamp: new Date().toISOString(),
            });
            return;
        }
        /*
        |--------------------------------------------------------------------------
        | Protected Resource Metadata
        |--------------------------------------------------------------------------
        */
        if (url.pathname ===
            PROTECTED_RESOURCE_METADATA_PATH) {
            if (method !== 'GET') {
                sendMethodNotAllowed(res, 'GET');
                return;
            }
            sendJson(res, 200, {
                resource: `${config.mcpPublicUrl}${MCP_PATH}`,
                authorization_servers: [
                    `${config.mcpPublicUrl}/oauth`,
                ],
                scopes_supported: [
                    REQUIRED_SCOPE,
                ],
                bearer_methods_supported: [
                    'header',
                ],
            });
            return;
        }
        /*
        |--------------------------------------------------------------------------
        | Authorization Server Metadata
        |--------------------------------------------------------------------------
        */
        if (url.pathname ===
            AUTHORIZATION_SERVER_METADATA_PATH) {
            if (method !== 'GET') {
                sendMethodNotAllowed(res, 'GET');
                return;
            }
            sendJson(res, 200, getOAuthAuthorizationServerMetadata());
            return;
        }
        /*
        |--------------------------------------------------------------------------
        | OAuth Authorize
        |--------------------------------------------------------------------------
        */
        if (url.pathname ===
            AUTHORIZE_PATH) {
            if (method !== 'GET') {
                sendMethodNotAllowed(res, 'GET');
                return;
            }
            const result = handleAuthorize(url);
            sendAuthorizeResult(res, result);
            return;
        }
        /*
        |--------------------------------------------------------------------------
        | OAuth Login
        |--------------------------------------------------------------------------
        */
        if (url.pathname ===
            LOGIN_PATH) {
            if (method !== 'GET' &&
                method !== 'POST') {
                sendMethodNotAllowed(res, 'GET, POST');
                return;
            }
            await handleLogin(req, res);
            return;
        }
        /*
        |--------------------------------------------------------------------------
        | OAuth Consent
        |--------------------------------------------------------------------------
        */
        if (url.pathname ===
            CONSENT_PATH) {
            if (method !== 'GET' &&
                method !== 'POST') {
                sendMethodNotAllowed(res, 'GET, POST');
                return;
            }
            await handleConsent(req, res);
            return;
        }
        /*
        |--------------------------------------------------------------------------
        | OAuth Token
        |--------------------------------------------------------------------------
        */
        if (url.pathname ===
            TOKEN_PATH) {
            if (method !== 'POST') {
                sendMethodNotAllowed(res, 'POST');
                return;
            }
            await handleToken(req, res);
            return;
        }
        /*
        |--------------------------------------------------------------------------
        | MCP
        |--------------------------------------------------------------------------
        */
        if (url.pathname ===
            MCP_PATH) {
            if (method !== 'POST') {
                sendMethodNotAllowed(res, 'POST');
                return;
            }
            await handleProtectedMcp(req, res);
            return;
        }
        /*
        |--------------------------------------------------------------------------
        | 404
        |--------------------------------------------------------------------------
        */
        sendNotFound(res);
    }
    catch (error) {
        console.error('[HTTP] Unhandled request error:', error);
        if (!res.headersSent) {
            sendJson(res, 500, {
                success: false,
                error: 'Internal server error.',
            });
        }
    }
});
/*
|--------------------------------------------------------------------------
| Client Errors
|--------------------------------------------------------------------------
*/
server.on('clientError', (error, socket) => {
    console.error('[HTTP] Client error:', error);
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});
/*
|--------------------------------------------------------------------------
| Graceful Shutdown
|--------------------------------------------------------------------------
*/
function shutdown(signal) {
    console.log(`[SYSTEM] Received ${signal}. Shutting down...`);
    server.close(() => {
        console.log('[SYSTEM] MCP server stopped.');
        process.exit(0);
    });
    setTimeout(() => {
        console.error('[SYSTEM] Forced shutdown.');
        process.exit(1);
    }, 10_000).unref();
}
/*
|--------------------------------------------------------------------------
| Process Signals
|--------------------------------------------------------------------------
*/
process.on('SIGINT', () => {
    shutdown('SIGINT');
});
process.on('SIGTERM', () => {
    shutdown('SIGTERM');
});
/*
|--------------------------------------------------------------------------
| Server Startup
|--------------------------------------------------------------------------
*/
server.once('listening', () => {
    console.log('');
    console.log('========================================');
    console.log('          NixaERP MCP Server');
    console.log('========================================');
    console.log(`MCP:              ${config.mcpPublicUrl}${MCP_PATH}`);
    console.log(`Health:           ${config.mcpPublicUrl}${HEALTH_PATH}`);
    console.log(`Protected:        ${config.mcpPublicUrl}${PROTECTED_RESOURCE_METADATA_PATH}`);
    console.log(`OAuth Metadata:   ${config.mcpPublicUrl}${AUTHORIZATION_SERVER_METADATA_PATH}`);
    console.log(`OAuth Authorize:  ${config.mcpPublicUrl}${AUTHORIZE_PATH}`);
    console.log(`OAuth Login:      ${config.mcpPublicUrl}${LOGIN_PATH}`);
    console.log(`OAuth Consent:    ${config.mcpPublicUrl}${CONSENT_PATH}`);
    console.log(`OAuth Token:      ${config.mcpPublicUrl}${TOKEN_PATH}`);
    console.log(`Environment:      ${config.nodeEnv}`);
    console.log(`Listen:           ${config.host}:${config.port}`);
    console.log('========================================');
    console.log('');
});
server.once('error', (error) => {
    console.error('[SYSTEM] Server startup error:', error);
    process.exit(1);
});
server.listen({
    host: config.host,
    port: config.port,
});
