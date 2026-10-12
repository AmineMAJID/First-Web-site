// Cookies, session identity headers, and public user shape.
// Sessions themselves live in the database (see lib/session.js).

export const COOKIE_NAME = 'auth-token';   // full session (after password + 2FA where required)
export const MFA_COOKIE = 'mfa-token';     // password checked, waiting for the 2FA code
export const SESSION_HOURS = Number(process.env.SESSION_HOURS || 8);
export const SESSION_IDLE_MINUTES = Number(process.env.SESSION_IDLE_MINUTES || 60);
export const MFA_MINUTES = 5;

// Public shape of a user. `permissions` is included when the caller computed it.
export function publicUser(user) {
    return {
        id: user.id,
        username: user.username,
        role: user.role,
        fullName: user.full_name,
        email: user.email,
        mustChangePassword: !!user.must_change_password,
        permissions: user.permissions ?? undefined,
    };
}

// Is the original request served over HTTPS (directly or behind a TLS-terminating proxy)?
export function isSecureRequest(request) {
    if (process.env.COOKIE_SECURE === 'true') return true;
    if (process.env.COOKIE_SECURE === 'false') return false;
    const proto = request?.headers.get('x-forwarded-proto')?.split(',')[0].trim();
    if (proto) return proto === 'https';
    try { return new URL(request.url).protocol === 'https:'; } catch { return false; }
}

// Cookies are httpOnly (no JavaScript access). Over HTTPS we use SameSite=None so the
// session also works inside the sandbox preview iframe; CSRF is then blocked by the
// Origin check in proxy.js. Over plain HTTP (local dev) we use Lax.
export function cookieOptions(request, maxAgeSeconds) {
    const secure = isSecureRequest(request);
    return {
        httpOnly: true,
        secure,
        sameSite: secure ? 'none' : 'lax',
        maxAge: maxAgeSeconds,
        path: '/',
    };
}

// Identity injected by proxy.js into request headers (the proxy strips any client-sent copy)
export function getSession(request) {
    const id = request.headers.get('x-user-id');
    if (!id) return null;
    return {
        id: Number(id),
        sessionId: Number(request.headers.get('x-session-id')) || null,
        role: request.headers.get('x-user-role'),
        fullName: decodeURIComponent(request.headers.get('x-user-name') || ''),
        permissions: new Set((request.headers.get('x-user-perms') || '').split(',').filter(Boolean)),
    };
}
