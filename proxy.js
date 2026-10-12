// Next.js 16 proxy (formerly middleware.js): authentication, role-based access, CSRF check.
import { NextResponse } from 'next/server';
import { COOKIE_NAME, MFA_COOKIE, cookieOptions } from './lib/auth.js';
import { resolveSession } from './lib/session.js';
import { landingFor, featureForPath } from './lib/permissions.js';

const PUBLIC_PATHS = new Set([
    '/login',
    '/api/auth/login',
    '/api/auth/logout',
    '/api/auth/setup-2fa',
    '/api/auth/verify-2fa',
    '/api/health',
]);

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const IDENTITY_HEADERS = ['x-user-id', 'x-user-role', 'x-user-name', 'x-session-id', 'x-user-perms'];

export async function proxy(request) {
    const { pathname } = request.nextUrl;
    const isApi = pathname.startsWith('/api/');

    // Cross-site CSRF protection: a browser sending a state-changing request from another
    // origin is refused. Requests without an Origin header (scripts, curl) are allowed.
    if (isApi && !SAFE_METHODS.has(request.method)) {
        const origin = request.headers.get('origin');
        const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
        if (origin) {
            let originHost = null;
            try { originHost = new URL(origin).host; } catch { /* invalid origin */ }
            if (originHost !== host) return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
        }
    }

    // Never trust identity headers sent by the client: remove them, then set our own below
    const requestHeaders = new Headers(request.headers);
    for (const h of IDENTITY_HEADERS) requestHeaders.delete(h);

    const token = request.cookies.get(COOKIE_NAME)?.value;
    const resolved = token ? await resolveSession(token, 'full') : null;
    const user = resolved?.user ?? null;

    // Public routes – but bounce already-authenticated users away from /login
    if (PUBLIC_PATHS.has(pathname)) {
        if (pathname === '/login' && user) {
            return NextResponse.redirect(new URL(landingFor(user.permissions), request.url));
        }
        return NextResponse.next({ request: { headers: requestHeaders } });
    }

    if (!user) {
        if (isApi) {
            const res = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            if (token) res.cookies.set(COOKIE_NAME, '', cookieOptions(request, 0));
            return res;
        }
        const login = new URL('/login', request.url);
        if (pathname !== '/') login.searchParams.set('next', pathname);
        const response = NextResponse.redirect(login);
        if (token) response.cookies.set(COOKIE_NAME, '', cookieOptions(request, 0));
        return response;
    }

    const landing = new URL(landingFor(user.permissions), request.url);
    if (pathname === '/' || pathname === '/dashboard') {
        return NextResponse.redirect(landing);
    }

    // Page guard: each page belongs to one feature, and the user must hold that feature's permission.
    // Pages not listed in the catalog are refused. Dashboard API routes check permissions themselves.
    if (pathname.startsWith('/dashboard/') && !isApi) {
        const feature = featureForPath(pathname);
        if (!feature || !user.permissions.includes(feature)) {
            return NextResponse.redirect(landing);
        }
    }

    requestHeaders.set('x-user-id', String(user.id));
    requestHeaders.set('x-user-role', user.role);
    requestHeaders.set('x-user-perms', user.permissions.join(','));
    requestHeaders.set('x-user-name', encodeURIComponent(user.full_name || ''));
    requestHeaders.set('x-session-id', String(resolved.sessionId));
    return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
    matcher: ['/', '/login', '/dashboard/:path*', '/api/:path*'],
};
