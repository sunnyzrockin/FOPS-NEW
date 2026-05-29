const nextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  // Next.js 15+ uses serverExternalPackages instead of experimental.serverComponentsExternalPackages
  serverExternalPackages: ['mongodb'],
  webpack(config, { dev }) {
    if (dev) {
      // Reduce CPU/memory from file watching
      config.watchOptions = {
        poll: 2000, // check every 2 seconds
        aggregateTimeout: 300, // wait before rebuilding
        ignored: ['**/node_modules'],
      };
    }
    return config;
  },
  onDemandEntries: {
    maxInactiveAge: 10000,
    pagesBufferLength: 2,
  },
  async headers() {
    // CORS is intentionally handled per-request inside route handlers
    // (see /app/lib/api/cors.js → corsHeadersFor()). That lets us echo
    // http://localhost:3000 during `yarn dev` while still locking down
    // to NEXT_PUBLIC_BASE_URL in production. Doing it here as a static
    // string would prevent any per-request logic and would also override
    // (silently wins) the route handlers' headers.
    //
    // Everything else in this block is static security headers that apply
    // to all responses regardless of method.
    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent clickjacking — only the app's own origin can frame it.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self';",
          },
          // Standard security headers
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self)',
          },
          // HSTS — only on HTTPS, harmless on HTTP locally
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
