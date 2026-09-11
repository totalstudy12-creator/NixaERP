import { validateAuthorizationRequest, } from './authorize.js';
import { getOAuthIssuer, } from './metadata.js';
import { createLoginSession, } from './login-store.js';
import { config } from '../config.js';
function html(content) {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >
  <meta
    name="referrer"
    content="no-referrer"
  >
  <title>NixaERP MCP Authorization</title>
  <style>
    body {
      margin: 0;
      padding: 40px 20px;
      background: #f6f7f9;
      font-family: Arial, sans-serif;
      color: #111827;
    }

    .card {
      width: 100%;
      max-width: 420px;
      margin: 0 auto;
      padding: 28px;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      box-sizing: border-box;
    }

    h1 {
      margin-top: 0;
      font-size: 24px;
    }

    label {
      display: block;
      margin-top: 16px;
      margin-bottom: 6px;
      font-size: 14px;
      font-weight: 600;
    }

    input {
      width: 100%;
      box-sizing: border-box;
      padding: 11px 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 15px;
    }

    button {
      width: 100%;
      margin-top: 22px;
      padding: 12px;
      border: 0;
      border-radius: 8px;
      background: #111827;
      color: white;
      font-size: 15px;
      cursor: pointer;
    }

    .muted {
      color: #6b7280;
      font-size: 13px;
      line-height: 1.5;
    }

    .error {
      margin-top: 14px;
      padding: 10px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #991b1b;
      border-radius: 8px;
    }
  </style>
</head>
<body>
  ${content}
</body>
</html>`;
}
function errorResponse(status, message) {
    return {
        status,
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            Pragma: 'no-cache',
            'X-Content-Type-Options': 'nosniff',
        },
        body: html(`
      <div class="card">
        <h1>Authorization Error</h1>
        <div class="error">
          ${escapeHtml(message)}
        </div>
      </div>
    `),
    };
}
function escapeHtml(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}
/**
 * OAuth authorization endpoint.
 *
 * The request is first validated.
 * A short-lived browser login session is then
 * created and the user is sent to the MCP login form.
 */
export function handleAuthorize(url) {
    const validation = validateAuthorizationRequest(url);
    if (!validation.valid ||
        !validation.request) {
        return errorResponse(400, validation.errorDescription ??
            'Invalid authorization request.');
    }
    if (config.nodeEnv ===
        'production' &&
        !process.env.NIXAERP_AUTH_ENABLED) {
        return errorResponse(503, 'NixaERP interactive authentication is not enabled.');
    }
    const request = validation.request;
    const session = createLoginSession({
        clientId: request.clientId,
        redirectUri: request.redirectUri,
        codeChallenge: request.codeChallenge,
        codeChallengeMethod: 'S256',
        scope: [
            ...request.scope,
        ],
        ...(request.state
            ? {
                state: request.state,
            }
            : {}),
    });
    const loginUrl = new URL('/oauth/login', getIssuerBaseUrl());
    loginUrl.searchParams.set('session', session.id);
    return {
        status: 302,
        headers: {
            Location: loginUrl.toString(),
            'Cache-Control': 'no-store',
            Pragma: 'no-cache',
        },
        body: '',
    };
}
function getIssuerBaseUrl() {
    const issuer = getOAuthIssuer();
    return issuer.endsWith('/oauth')
        ? issuer.slice(0, -'/oauth'.length)
        : issuer;
}
