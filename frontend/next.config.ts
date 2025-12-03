import type {NextConfig} from "next";

const nextConfig: NextConfig = {
    /* config options here */
    eslint: {
        ignoreDuringBuilds: true,
    },
    typescript: {
        ignoreBuildErrors: true,
    },
    serverExternalPackages: ['mongodb'],
    webpack: (config, { isServer }) => {
        // Exclude MongoDB from client-side bundles
        if (!isServer) {
            config.resolve.alias = {
                ...config.resolve.alias,
                'mongodb': false,
            };
        }
        return config;
    },
};

export default nextConfig;
