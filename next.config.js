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
    // Restrict CORS to your own domains in production. Set CORS_ORIGINS in
    // Vercel env vars to a comma-separated list, e.g.
    //   CORS_ORIGINS=https://fopsapp.com,https://www.fopsapp.com
    // If unset, defaults to the production domain.
    const corsOrigin = process.env.CORS_ORIGINS || 'https://fopsapp.com';
    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent clickjacking — only fopsapp.com itself can frame the app.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self';",
          },
          // Tighter CORS than wide-open `*`.
          { key: 'Access-Control-Allow-Origin', value: corsOrigin },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
          },
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
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
