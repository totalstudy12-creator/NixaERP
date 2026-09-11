import { getLoginSession, consumeLoginSession, } from './login-store.js';
import { generateAuthorizationCode, } from './pkce.js';
import { saveAuthorizationCode, } from './store.js';
import { getOAuthIssuer, } from './metadata.js';
function escapeHtml(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}
function html(content) {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
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
      max-width: 500px;
      margin: 0 auto;
      padding: 28px;
      box-sizing: border-box;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
    }

    h1 {
      margin-top: 0;
      font-size: 24px;
    }

    h2 {
      margin-top: 24px;
      font-size: 16px;
    }

    p {
      line-height: 1.55;
    }

    .account {
      padding: 12px;
      background: #f9fafb;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
      margin-top: 16px;
    }

    .scope {
      margin-top: 16px;
      padding: 14px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
    }

    .scope code {
      font-size: 13px;
    }

    .actions {
      display: flex;
      gap: 12px;
      margin-top: 24px;
    }

    button {
      flex: 1;
      padding: 12px;
      border: 0;
      border-radius: 8px;
      font-size: 15px;
      cursor: pointer;
    }

    .allow {
      background: #111827;
      color: #fff;
    }

    .deny {
      background: #f3f4f6;
      color: #111827;
      border: 1px solid #d1d5db;
    }

    .muted {
      color: #6b7280;
      font-size: 13px;
    }
  </style>
</head>
<body>
  ${content}
</body>
</html>`;
}
function sendHtml(res, statusCode, body) {
    if (res.headersSent) {
        return;
    }
    res.statusCode =
        statusCode;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(body);
}
function redirectToClient(res, redirectUri, code, state, error, errorDescription) {
    const redirect = new URL(redirectUri);
    if (code) {
        redirect.searchParams.set('code', code);
    }
    if (state) {
        redirect.searchParams.set('state', state);
    }
    if (error) {
        redirect.searchParams.set('error', error);
    }
    if (errorDescription) {
        redirect.searchParams.set('error_description', errorDescription);
    }
    redirect.searchParams.set('iss', getOAuthIssuer());
    res.statusCode = 302;
    res.setHeader('Location', redirect.toString());
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.end();
}
export async function handleConsent(req, res) {
    const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
    const sessionId = requestUrl.searchParams.get('session');
    if (!sessionId) {
        sendHtml(res, 400, html(`
        <div class="card">
          <h1>Authorization Error</h1>
          <p>Missing authorization session.</p>
        </div>
      `));
        return;
    }
    const session = getLoginSession(sessionId);
    if (!session) {
        sendHtml(res, 400, html(`
        <div class="card">
          <h1>Session Expired</h1>
          <p>
            Please restart the OAuth authorization flow.
          </p>
        </div>
      `));
        return;
    }
    /*
     * The consent page is available only after
     * successful NixaERP authentication.
     */
    if (!session.userId || !session.user) {
        sendHtml(res, 403, html(`
        <div class="card">
          <h1>Authentication Required</h1>
          <p>
            You must sign in to NixaERP before
            granting MCP access.
          </p>
        </div>
      `));
        return;
    }
    if (req.method === 'GET') {
        sendHtml(res, 200, html(`
        <div class="card">
          <h1>Authorize NixaERP MCP</h1>

          <p>
            The MCP client is requesting access to
            your NixaERP account.
          </p>

          <div class="account">
            <strong>Signed in as</strong>
            <br>
            ${escapeHtml(session.user.name ??
            '')}
            <br>
            <span class="muted">
              ${escapeHtml(session.user.email ??
            '')}
            </span>
          </div>

          <h2>Requested access</h2>

          <div class="scope">
            <strong>NixaERP MCP</strong>
            <br>
            <code>
              ${escapeHtml(session.scope.join(' '))}
            </code>
          </div>

          <p class="muted">
            This authorization grants the MCP client
            access only to the approved NixaERP scope.
          </p>

          <form method="POST">
            <input
              type="hidden"
              name="session"
              value="${escapeHtml(session.id)}"
            >

            <div class="actions">
              <button
                class="deny"
                type="submit"
                name="decision"
                value="deny"
              >
                Deny
              </button>

              <button
                class="allow"
                type="submit"
                name="decision"
                value="allow"
              >
                Allow Access
              </button>
            </div>
          </form>
        </div>
      `));
        return;
    }
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'GET, POST');
        sendHtml(res, 405, html(`
        <div class="card">
          <h1>Method Not Allowed</h1>
        </div>
      `));
        return;
    }
    const contentType = String(req.headers['content-type'] ?? '')
        .split(';', 1)[0]
        ?.trim()
        .toLowerCase() ?? '';
    if (contentType !==
        'application/x-www-form-urlencoded') {
        sendHtml(res, 415, html(`
        <div class="card">
          <h1>Invalid Request</h1>
          <p>
            The consent form submitted an invalid
            content type.
          </p>
        </div>
      `));
        return;
    }
    const body = await new Promise((resolve, reject) => {
        let value = '';
        let completed = false;
        const finish = (callback) => {
            if (completed) {
                return;
            }
            completed = true;
            callback();
        };
        req.setEncoding('utf8');
        req.on('data', (chunk) => {
            value += chunk;
            if (Buffer.byteLength(value, 'utf8') > 16 * 1024) {
                finish(() => {
                    reject(new Error('Request body too large.'));
                });
                req.destroy();
            }
        });
        req.on('end', () => {
            finish(() => {
                resolve(value);
            });
        });
        req.on('error', (error) => {
            finish(() => {
                reject(error);
            });
        });
    });
    const params = new URLSearchParams(body);
    const postedSessionId = params.get('session') ?? '';
    const decision = params.get('decision') ?? '';
    if (postedSessionId !==
        session.id) {
        sendHtml(res, 400, html(`
        <div class="card">
          <h1>Invalid Session</h1>
        </div>
      `));
        return;
    }
    /*
     * Deny
     */
    if (decision === 'deny') {
        consumeLoginSession(session.id);
        redirectToClient(res, session.redirectUri, undefined, session.state, 'access_denied', 'The NixaERP user denied MCP access.');
        return;
    }
    /*
     * Allow
     */
    if (decision !== 'allow') {
        sendHtml(res, 400, html(`
        <div class="card">
          <h1>Invalid Decision</h1>
        </div>
      `));
        return;
    }
    /*
     * The authenticated NixaERP user is now bound
     * to the authorization code.
     */
    const code = generateAuthorizationCode();
    const expiresAt = Date.now() +
        60_000;
    saveAuthorizationCode({
        code,
        clientId: session.clientId,
        redirectUri: session.redirectUri,
        codeChallenge: session.codeChallenge,
        codeChallengeMethod: 'S256',
        scope: [
            ...session.scope,
        ],
        expiresAt,
        used: false,
        issuer: getOAuthIssuer(),
        userId: session.userId,
    });
    /*
     * We no longer need the login session
     * after the authorization code is created.
     *
     * This also prevents the same login session
     * from generating multiple authorization codes.
     */
    consumeLoginSession(session.id);
    redirectToClient(res, session.redirectUri, code, session.state);
}
