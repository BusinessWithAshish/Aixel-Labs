import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    /* config options here */
    // A second local `next dev` (e.g. a demo preview beside the e2e server) needs its own build folder.
    distDir: process.env.NEXT_DIST_DIR || '.next',
    eslint: {
        ignoreDuringBuilds: true,
    },
    typescript: {
        ignoreBuildErrors: true,
    },
    images: {
        unoptimized: true,
    },
    // Keep native/server-only packages out of the webpack bundle entirely
    serverExternalPackages: ['mongodb', 'node-tls-client', 'undici'],
    webpack: (config, { isServer }) => {
        if (!isServer) {
            config.resolve.alias = {
                ...config.resolve.alias,
                mongodb: false,
                'node-tls-client': false,
            };
        }
        return config;
    },
};

export default nextConfig;
