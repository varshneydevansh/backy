/** @type {import('next').NextConfig} */
const nextConfig = {
    // Enable React strict mode for better development experience
    reactStrictMode: true,

    // Configure for subdomain routing
    async rewrites() {
        return {
            // Handle subdomain routing for sites
            beforeFiles: [
                {
                    source: '/:path*',
                    has: [
                        {
                            type: 'host',
                            value: '(?<subdomain>[^.]+)\\.(?<domain>.+)',
                        },
                    ],
                    destination: '/sites/:subdomain/:path*',
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
