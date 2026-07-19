import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    /* config options here */
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
    serverExternalPackages: ['mongodb', 'node-tls-client'],
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
