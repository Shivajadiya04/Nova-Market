// Central HTTP client. Every backend call goes through apiRequest so errors, the auth cookie
// and session expiry are handled the same way everywhere.

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export class ApiError extends Error {
    constructor(message, status, data) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.data = data;
    }
}

let unauthorizedHandler = null;

// Called with no arguments whenever an authenticated request comes back 401.
export function setUnauthorizedHandler(handler) {
    unauthorizedHandler = handler;
}

const GENERIC_MESSAGES = [ 'Internal server error', 'Internal Server Error' ];

function extractMessage(data, status) {
    if (data && typeof data === 'object') {
        if (Array.isArray(data.errors) && data.errors.length) {
            return data.errors.map(e => e.msg).filter(Boolean).join('. ');
        }
        if (data.message && data.error && GENERIC_MESSAGES.includes(data.message)) {
            return `${data.message}: ${data.error}`;
        }
        if (data.message) return data.message;
    }
    if (status >= 502 || status === 500) {
        return 'The service is unavailable. Check that the backend is running.';
    }
    return `Request failed (${status})`;
}

export async function apiRequest(path, { method = 'GET', body, auth = true } = {}) {
    const isForm = body instanceof FormData;
    let response;

    try {
        response = await fetch(`${BASE_URL}${path}`, {
            method,
            credentials: 'include',
            headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
            body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
        });
    } catch {
        throw new ApiError('Cannot reach the server. Check that the backend is running.', 0, null);
    }

    const text = await response.text();
    let data = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            data = null;
        }
    }

    if (!response.ok) {
        if (response.status === 401 && auth && unauthorizedHandler) {
            unauthorizedHandler();
        }
        throw new ApiError(extractMessage(data, response.status), response.status, data);
    }

    return data;
}

export function toQuery(params) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([ key, value ]) => {
        if (value !== undefined && value !== null && value !== '') search.set(key, value);
    });
    const query = search.toString();
    return query ? `?${query}` : '';
}
