import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    transpilePackages: ['@aixellabs/backend'],
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
    serverExternalPackages: ['mongodb'],
    webpack: (config, { isServer }) => {
        // Exclude MongoDB from client-side bundles
        if (!isServer) {
            config.resolve.alias = {
                ...config.resolve.alias,
                mongodb: false,
            };
        }
        return config;
    },
};

export default nextConfig;
