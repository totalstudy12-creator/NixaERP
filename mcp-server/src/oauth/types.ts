export interface OAuthClient {
  clientId: string;
  redirectUris: string[];
  name?: string;
}

export interface AuthorizationCode {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  scope: string[];
  expiresAt: number;
  used: boolean;

  /*
   * OAuth authorization server issuer.
   *
   * Used to bind the authorization code
   * to the expected issuer.
   */
  issuer: string;

  /*
   * NixaERP authenticated user ID.
   */
  userId: number;
}