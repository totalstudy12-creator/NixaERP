import { randomBytes } from 'node:crypto';

import type {
  NixaerpUser,
} from './nixaerp-client.js';

interface LoginSession {
  id: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  scope: string[];
  state?: string;
  expiresAt: number;
  userId?: number;
  user?: NixaerpUser;
  nixaerpAccessToken?: string;
}

const LOGIN_SESSION_TTL_MS =
  10 * 60 * 1000;

const sessions =
  new Map<string, LoginSession>();

function cleanup(): void {
  const now =
    Date.now();

  for (
    const [id, session]
    of sessions
  ) {
    if (
      session.expiresAt <= now
    ) {
      sessions.delete(id);
    }
  }
}

function generateId(): string {
  return randomBytes(
    32,
  ).toString('base64url');
}

export function createLoginSession(
  input: Omit<
    LoginSession,
    'id' | 'expiresAt'
  >,
): LoginSession {
  cleanup();

  const session: LoginSession = {
    ...input,
    id: generateId(),
    expiresAt:
      Date.now() +
      LOGIN_SESSION_TTL_MS,
  };

  sessions.set(
    session.id,
    session,
  );

  return {
    ...session,
  };
}

export function getLoginSession(
  id: string,
): LoginSession | null {
  cleanup();

  const session =
    sessions.get(id);

  if (!session) {
    return null;
  }

  if (
    session.expiresAt <=
    Date.now()
  ) {
    sessions.delete(id);
    return null;
  }

  return {
    ...session,
  };
}

export function updateLoginSession(
  id: string,
  updates: Partial<
    Pick<
      LoginSession,
      | 'userId'
      | 'user'
      | 'nixaerpAccessToken'
    >
  >,
): LoginSession | null {
  cleanup();

  const session =
    sessions.get(id);

  if (!session) {
    return null;
  }

  Object.assign(
    session,
    updates,
  );

  sessions.set(
    id,
    session,
  );

  return {
    ...session,
  };
}

export function consumeLoginSession(
  id: string,
): LoginSession | null {
  cleanup();

  const session =
    sessions.get(id);

  if (!session) {
    return null;
  }

  sessions.delete(id);

  return {
    ...session,
  };
}

const cleanupTimer =
  setInterval(
    cleanup,
    30_000,
  );

cleanupTimer.unref();