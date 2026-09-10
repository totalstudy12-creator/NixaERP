import { randomBytes } from 'node:crypto';
const LOGIN_SESSION_TTL_MS = 10 * 60 * 1000;
const sessions = new Map();
function cleanup() {
    const now = Date.now();
    for (const [id, session] of sessions) {
        if (session.expiresAt <= now) {
            sessions.delete(id);
        }
    }
}
function generateId() {
    return randomBytes(32).toString('base64url');
}
export function createLoginSession(input) {
    cleanup();
    const session = {
        ...input,
        id: generateId(),
        expiresAt: Date.now() +
            LOGIN_SESSION_TTL_MS,
    };
    sessions.set(session.id, session);
    return {
        ...session,
    };
}
export function getLoginSession(id) {
    cleanup();
    const session = sessions.get(id);
    if (!session) {
        return null;
    }
    if (session.expiresAt <=
        Date.now()) {
        sessions.delete(id);
        return null;
    }
    return {
        ...session,
    };
}
export function updateLoginSession(id, updates) {
    cleanup();
    const session = sessions.get(id);
    if (!session) {
        return null;
    }
    Object.assign(session, updates);
    sessions.set(id, session);
    return {
        ...session,
    };
}
export function consumeLoginSession(id) {
    cleanup();
    const session = sessions.get(id);
    if (!session) {
        return null;
    }
    sessions.delete(id);
    return {
        ...session,
    };
}
const cleanupTimer = setInterval(cleanup, 30_000);
cleanupTimer.unref();
