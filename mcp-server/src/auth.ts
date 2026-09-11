import {
  OAuthError,
  OAuthErrorCode,
  type AuthInfo,
  type OAuthTokenVerifier,
} from '@modelcontextprotocol/server';

import { config } from './config.js';

import {
  getAccessToken,
} from './oauth/access-token-store.js';

const REQUIRED_SCOPE =
  'mcp:read';

function hasRequiredScope(
  scopes: string[],
): boolean {
  return scopes.includes(
    REQUIRED_SCOPE,
  );
}

export const nixaerpTokenVerifier:
  OAuthTokenVerifier = {
    async verifyAccessToken(
      token: string,
    ): Promise<AuthInfo> {
      if (
        !token ||
        token.trim().length === 0
      ) {
        throw new OAuthError(
          OAuthErrorCode.InvalidToken,
          'Missing MCP access token.',
        );
      }

      /*
       * ---------------------------------------------------------------
       * 1. Existing NixaERP MCP token
       * ---------------------------------------------------------------
       *
       * Keeps the current local/development
       * token working.
       */
      if (
        token ===
        config.nixaerpMcpToken
      ) {
        return {
          token,
          clientId:
            'nixaerp-local-client',
          scopes: [
            REQUIRED_SCOPE,
          ],
          expiresAt:
            Math.floor(
              Date.now() / 1000,
            ) + 3600,
        };
      }

      /*
       * ---------------------------------------------------------------
       * 2. OAuth access token
       * ---------------------------------------------------------------
       */
      const accessToken =
        getAccessToken(token);

      if (!accessToken) {
        throw new OAuthError(
          OAuthErrorCode.InvalidToken,
          'Invalid or expired MCP access token.',
        );
      }

      if (
        !hasRequiredScope(
          accessToken.scopes,
        )
      ) {
        throw new OAuthError(
          OAuthErrorCode.InsufficientScope,
          'Required scope mcp:read is missing.',
        );
      }

      /*
       * Convert our internal token record
       * into MCP SDK AuthInfo.
       */
      return {
        token:
          accessToken.token,

        clientId:
          accessToken.clientId,

        scopes: [
          ...accessToken.scopes,
        ],

        expiresAt:
          accessToken.expiresAt,
      };
    },
  };