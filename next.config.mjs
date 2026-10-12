/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow the dev server to be embedded / accessed from sandbox preview hosts
  allowedDevOrigins: ['*.e2b.app', 'localhost', '127.0.0.1'],
  poweredByHeader: false,
  async headers() {
    const security = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      // Note: no X-Frame-Options here on purpose: the sandbox preview embeds the app in an iframe
    ];
    return [
      { source: '/:path*', headers: security },
      // Personal data and session-related responses must never be cached by browsers or proxies
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
    ];
  },
};

export default nextConfig;
