import { config } from '../config.js';
export class NixaerpAuthError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.status = status;
        this.name = 'NixaerpAuthError';
    }
}
function getUrl(path) {
    return `${config.nixaerpApiBaseUrl}${path}`;
}
async function parseJson(response) {
    const text = await response.text();
    if (!text) {
        return null;
    }
    try {
        return JSON.parse(text);
    }
    catch {
        return {
            raw: text,
        };
    }
}
function getErrorMessage(payload, fallback) {
    if (payload &&
        typeof payload === 'object') {
        const value = payload;
        if (typeof value.message === 'string') {
            return value.message;
        }
        if (typeof value.error === 'string') {
            return value.error;
        }
    }
    return fallback;
}
export async function loginToNixaerp(email, password) {
    const response = await fetch(getUrl('/login'), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({
            email,
            password,
        }),
    });
    const payload = await parseJson(response);
    if (!response.ok) {
        throw new NixaerpAuthError(getErrorMessage(payload, 'NixaERP login failed.'), response.status);
    }
    const data = payload;
    if (!data ||
        typeof data.access_token !==
            'string' ||
        data.access_token.length < 20) {
        throw new NixaerpAuthError('NixaERP login did not return a valid access token.', 502);
    }
    const accessToken = data.access_token;
    const meResponse = await fetch(getUrl('/me'), {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
        },
    });
    const mePayload = await parseJson(meResponse);
    if (!meResponse.ok) {
        throw new NixaerpAuthError(getErrorMessage(mePayload, 'Unable to load the NixaERP user profile.'), meResponse.status);
    }
    const user = mePayload;
    if (!user ||
        typeof user.id !== 'number') {
        throw new NixaerpAuthError('NixaERP returned an invalid user profile.', 502);
    }
    return {
        accessToken,
        user,
    };
}
