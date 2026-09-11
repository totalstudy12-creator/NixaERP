import type {
  IncomingMessage,
  ServerResponse,
} from 'node:http';

import {
  getLoginSession,
  updateLoginSession,
} from './login-store.js';

import {
  loginToNixaerp,
  NixaerpAuthError,
} from './nixaerp-client.js';

import {
  generateAuthorizationCode,
} from './pkce.js';

import {
  saveAuthorizationCode,
} from './store.js';

import {
  getOAuthIssuer,
} from './metadata.js';

const FORM_MAX_SIZE =
  16 * 1024;

function escapeHtml(
  value: string,
): string {
  return value
    .replaceAll(
      '&',
      '&amp;',
    )
    .replaceAll(
      '<',
      '&lt;',
    )
    .replaceAll(
      '>',
      '&gt;',
    )
    .replaceAll(
      '"',
      '&quot;',
    )
    .replaceAll(
      "'",
      '&#039;',
    );
}

function html(
  content: string,
): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >
  <title>NixaERP MCP Login</title>
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
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      box-sizing: border-box;
    }

    h1 {
      margin-top: 0;
      font-size: 24px;
    }

    p {
      line-height: 1.5;
    }

    label {
      display: block;
      margin-top: 16px;
      margin-bottom: 6px;
      font-weight: 600;
      font-size: 14px;
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
      color: #ffffff;
      font-size: 15px;
      cursor: pointer;
    }

    .muted {
      color: #6b7280;
      font-size: 13px;
    }

    .error {
      margin-top: 14px;
      padding: 10px;
      border-radius: 8px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #991b1b;
    }
  </style>
</head>
<body>
  ${content}
</body>
</html>`;
}

function sendHtml(
  res: ServerResponse,
  statusCode: number,
  body: string,
): void {
  res.statusCode =
    statusCode;

  res.setHeader(
    'Content-Type',
    'text/html; charset=utf-8',
  );

  res.setHeader(
    'Cache-Control',
    'no-store',
  );

  res.setHeader(
    'Pragma',
    'no-cache',
  );

  res.setHeader(
    'X-Content-Type-Options',
    'nosniff',
  );

  res.end(body);
}

async function readBody(
  req: IncomingMessage,
): Promise<string> {
  return new Promise(
    (
      resolve,
      reject,
    ) => {
      let body = '';
      let finished = false;

      const finish = (
        callback: () => void,
      ): void => {
        if (finished) {
          return;
        }

        finished = true;
        callback();
      };

      req.setEncoding('utf8');

      req.on(
        'data',
        (chunk: string) => {
          body += chunk;

          if (
            Buffer.byteLength(
              body,
              'utf8',
            ) > FORM_MAX_SIZE
          ) {
            finish(() => {
              reject(
                new Error(
                  'Request body too large.',
                ),
              );
            });

            req.destroy();
          }
        },
      );

      req.on(
        'end',
        () => {
          finish(() => {
            resolve(body);
          });
        },
      );

      req.on(
        'error',
        (error) => {
          finish(() => {
            reject(error);
          });
        },
      );
    },
  );
}

function redirectToAuthorize(
  res: ServerResponse,
  sessionId: string,
  code: string,
  state?: string,
): void {
  /*
   * The current session already contains the
   * exact registered redirect URI.
   */
  const session =
    getLoginSession(
      sessionId,
    );

  if (!session) {
    sendHtml(
      res,
      400,
      html(`
        <div class="card">
          <h1>Authorization Error</h1>
          <p>Login session expired.</p>
        </div>
      `),
    );

    return;
  }

  const redirect =
    new URL(
      session.redirectUri,
    );

  redirect.searchParams.set(
    'code',
    code,
  );

  if (state) {
    redirect.searchParams.set(
      'state',
      state,
    );
  }

  redirect.searchParams.set(
    'iss',
    getOAuthIssuer(),
  );

  res.statusCode =
    302;

  res.setHeader(
    'Location',
    redirect.toString(),
  );

  res.setHeader(
    'Cache-Control',
    'no-store',
  );

  res.setHeader(
    'Pragma',
    'no-cache',
  );

  res.end();
}

export async function handleLogin(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url =
    new URL(
      req.url ?? '/',
      'http://127.0.0.1',
    );

  const sessionId =
    url.searchParams.get(
      'session',
    );

  if (
    !sessionId
  ) {
    sendHtml(
      res,
      400,
      html(`
        <div class="card">
          <h1>Login Error</h1>
          <p>Missing authorization session.</p>
        </div>
      `),
    );

    return;
  }

  const session =
    getLoginSession(
      sessionId,
    );

  if (!session) {
    sendHtml(
      res,
      400,
      html(`
        <div class="card">
          <h1>Login Expired</h1>
          <p>Please start the OAuth authorization flow again.</p>
        </div>
      `),
    );

    return;
  }

  if (
    req.method === 'GET'
  ) {
    sendHtml(
      res,
      200,
      html(`
        <div class="card">
          <h1>NixaERP Login</h1>

          <p>
            Sign in to authorize MCP access to your
            NixaERP account.
          </p>

          <p class="muted">
            Requested scope:
            ${escapeHtml(
              session.scope.join(
                ' ',
              ),
            )}
          </p>

          <form method="POST">
            <input
              type="hidden"
              name="session"
              value="${escapeHtml(
                session.id,
              )}"
            >

            <label for="email">
              Email
            </label>

            <input
              id="email"
              name="email"
              type="email"
              autocomplete="username"
              required
              maxlength="255"
            >

            <label for="password">
              Password
            </label>

            <input
              id="password"
              name="password"
              type="password"
              autocomplete="current-password"
              required
              maxlength="255"
            >

            <button
              type="submit"
            >
              Sign in and authorize
            </button>
          </form>

          <p class="muted">
            Your password is sent only to the NixaERP
            login API over the configured connection.
          </p>
        </div>
      `),
    );

    return;
  }

  if (
    req.method !== 'POST'
  ) {
    res.setHeader(
      'Allow',
      'GET, POST',
    );

    sendHtml(
      res,
      405,
      html(`
        <div class="card">
          <h1>Method Not Allowed</h1>
        </div>
      `),
    );

    return;
  }

  const contentType =
    String(
      req.headers[
        'content-type'
      ] ?? '',
    )
      .split(';', 1)[0]
      ?.trim()
      .toLowerCase() ?? '';

  if (
    contentType !==
    'application/x-www-form-urlencoded'
  ) {
    sendHtml(
      res,
      415,
      html(`
        <div class="card">
          <h1>Invalid Request</h1>
          <p>
            Login form must use
            application/x-www-form-urlencoded.
          </p>
        </div>
      `),
    );

    return;
  }

  try {
    const body =
      await readBody(req);

    const params =
      new URLSearchParams(
        body,
      );

    const email =
      params.get(
        'email',
      )?.trim() ?? '';

    const password =
      params.get(
        'password',
      ) ?? '';

    const submittedSessionId =
      params.get(
        'session',
      ) ?? '';

    if (
      submittedSessionId !==
      session.id
    ) {
      sendHtml(
        res,
        400,
        html(`
          <div class="card">
            <h1>Invalid Session</h1>
          </div>
        `),
      );

      return;
    }

    if (
      !email ||
      !password
    ) {
      sendHtml(
        res,
        422,
        html(`
          <div class="card">
            <h1>Login Failed</h1>
            <div class="error">
              Email and password are required.
            </div>
          </div>
        `),
      );

      return;
    }

    const authentication =
      await loginToNixaerp(
        email,
        password,
      );

    const updated =
      updateLoginSession(
        session.id,
        {
          userId:
            authentication.user.id,

          user:
            authentication.user,

          nixaerpAccessToken:
            authentication.accessToken,
        },
      );

    if (!updated) {
      sendHtml(
        res,
        400,
        html(`
          <div class="card">
            <h1>Session Expired</h1>
            <p>
              Please restart the authorization request.
            </p>
          </div>
        `),
      );

      return;
    }

    const code =
      generateAuthorizationCode();

    const expiresAt =
      Date.now() + 60_000;

    saveAuthorizationCode({
      code,

      clientId:
        session.clientId,

      redirectUri:
        session.redirectUri,

      codeChallenge:
        session.codeChallenge,

      codeChallengeMethod:
        'S256',

      scope:
        [
          ...session.scope,
        ],

      expiresAt,

      used: false,

      issuer:
        getOAuthIssuer(),

      userId:
        authentication.user.id,
    });

    redirectToAuthorize(
      res,
      session.id,
      code,
      session.state,
    );
  } catch (error) {
    console.error(
      '[OAuth] NixaERP login failed:',
      error,
    );

    if (
      error instanceof
      NixaerpAuthError
    ) {
      const message =
        error.status === 401
          ? 'Invalid NixaERP email or password.'
          : error.message;

      sendHtml(
        res,
        error.status === 401
          ? 401
          : 502,
        html(`
          <div class="card">
            <h1>Login Failed</h1>
            <div class="error">
              ${escapeHtml(
                message,
              )}
            </div>
            <p>
              Please go back and try again.
            </p>
          </div>
        `),
      );

      return;
    }

    sendHtml(
      res,
      500,
      html(`
        <div class="card">
          <h1>Login Failed</h1>
          <div class="error">
            Unable to complete NixaERP authentication.
          </div>
        </div>
      `),
    );
  }
}