/** @type {import('next').NextConfig} */
const nextConfig = {
    ...(process.env.BACKY_NEXT_DIST_DIR ? { distDir: process.env.BACKY_NEXT_DIST_DIR } : {}),

    // Enable React strict mode for better development experience
    reactStrictMode: true,

    // Bundle Backy workspace packages into Vercel functions. Provider-specific
    // third-party storage/database clients stay lazy inside those packages.
    transpilePackages: ['@backy-cms/core', '@backy/db', '@backy/storage'],
    serverExternalPackages: ['better-sqlite3', 'mysql2'],

    // Configure for subdomain routing
    async rewrites() {
        return {
            // Handle subdomain routing for sites
            beforeFiles: [
                {
                    source: '/:path((?!api(?:/|$)|_next(?:/|$)|sites(?:/|$)|favicon\\.ico$|robots\\.txt$|sitemap\\.xml$).*)',
                    has: [
                        {
                            type: 'host',
                            value: '(?<subdomain>[^.]+)\\.(?<domain>(?!vercel\\.app$).*[A-Za-z].*)',
                        },
                    ],
                    destination: '/sites/:subdomain/:path',
                },
            ],
        };
    },

    // Image optimization domains
    images: {
        remotePatterns: [
            { protocol: 'https', hostname: '**.supabase.co' },
            { protocol: 'https', hostname: '**.amazonaws.com' },
        ],
    },

    // Experimental features
    experimental: {
        // Enable server actions for form handling
        serverActions: {
            bodySizeLimit: '2mb',
        },
    },
};

module.exports = nextConfig;
