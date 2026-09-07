import { config } from '../config.js';

export interface NixaerpUser {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  location?: string | null;
  timezone?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  roles?: Array<{
    id: number;
    name: string;
  }>;
}

interface LoginResponse {
  access_token?: string;
  token_type?: string;
}

export class NixaerpAuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'NixaerpAuthError';
  }
}

function getUrl(
  path: string,
): string {
  return `${config.nixaerpApiBaseUrl}${path}`;
}

async function parseJson(
  response: Response,
): Promise<unknown> {
  const text =
    await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      raw: text,
    };
  }
}

function getErrorMessage(
  payload: unknown,
  fallback: string,
): string {
  if (
    payload &&
    typeof payload === 'object'
  ) {
    const value =
      payload as Record<
        string,
        unknown
      >;

    if (
      typeof value.message === 'string'
    ) {
      return value.message;
    }

    if (
      typeof value.error === 'string'
    ) {
      return value.error;
    }
  }

  return fallback;
}

export async function loginToNixaerp(
  email: string,
  password: string,
): Promise<{
  accessToken: string;
  user: NixaerpUser;
}> {
  const response =
    await fetch(
      getUrl('/login'),
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json',
          Accept:
            'application/json',
        },

        body: JSON.stringify({
          email,
          password,
        }),
      },
    );

  const payload =
    await parseJson(response);

  if (!response.ok) {
    throw new NixaerpAuthError(
      getErrorMessage(
        payload,
        'NixaERP login failed.',
      ),
      response.status,
    );
  }

  const data =
    payload as LoginResponse | null;

  if (
    !data ||
    typeof data.access_token !==
      'string' ||
    data.access_token.length < 20
  ) {
    throw new NixaerpAuthError(
      'NixaERP login did not return a valid access token.',
      502,
    );
  }

  const accessToken =
    data.access_token;

  const meResponse =
    await fetch(
      getUrl('/me'),
      {
        method: 'GET',

        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          Accept:
            'application/json',
        },
      },
    );

  const mePayload =
    await parseJson(
      meResponse,
    );

  if (!meResponse.ok) {
    throw new NixaerpAuthError(
      getErrorMessage(
        mePayload,
        'Unable to load the NixaERP user profile.',
      ),
      meResponse.status,
    );
  }

  const user =
    mePayload as NixaerpUser | null;

  if (
    !user ||
    typeof user.id !== 'number'
  ) {
    throw new NixaerpAuthError(
      'NixaERP returned an invalid user profile.',
      502,
    );
  }

  return {
    accessToken,
    user,
  };
}