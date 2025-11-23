'use client';

import { useState, useEffect } from 'react';
import { RootLayoutUI } from '../common/RootLayout';
import { getTenantCurrentByUrl } from '@/helpers/get-current-tenant-by-url';

type IframeEmbedProps = {
    src: string;
    title?: string;
    showHeader?: boolean;
    headerText?: string;
    className?: string;
    allowedFeatures?: string[];
    sandboxRules?: string[];
    onLoad?: () => void;
    onError?: () => void;
    loadingComponent?: React.ReactNode;
    errorComponent?: React.ReactNode;
};

export default function IframeEmbed({
    src,
    title = 'Embedded Content',
    showHeader = false,
    headerText,
    className = '',
    allowedFeatures = [
        'accelerometer',
        'autoplay',
        'clipboard-write',
        'encrypted-media',
        'gyroscope',
        'picture-in-picture',
        'fullscreen',
    ],
    sandboxRules = [
        'allow-same-origin',
        'allow-scripts',
        'allow-forms',
        'allow-popups',
        'allow-popups-to-escape-sandbox',
        'allow-modals',
        'allow-downloads',
    ],
    onLoad,
    onError,
    loadingComponent,
    errorComponent,
}: IframeEmbedProps) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        // Reset states when src changes
        setLoading(true);
        setError(false);
    }, [src]);

    const handleLoad = () => {
        setLoading(false);
        setError(false);
        onLoad?.();
    };

    const handleError = () => {
        setLoading(false);
        setError(true);
        onError?.();
    };

    const defaultLoadingComponent = () => {
        // Only get tenant name after component has mounted to avoid hydration mismatch
        const currentTenant = mounted ? getTenantCurrentByUrl()?.toUpperCase() : '';
        return (
            <div className="flex items-center justify-center h-full bg-gray-50">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-300 border-t-blue-600 mb-4"></div>
                    <p className="text-gray-600 text-sm">
                        {currentTenant && `${currentTenant} `}Loading your demo... This may take a few seconds.
                    </p>
                </div>
            </div>
        );
    };

    const defaultErrorComponent = () => {
        // Only get tenant name after component has mounted to avoid hydration mismatch
        const currentTenant = mounted ? getTenantCurrentByUrl()?.toUpperCase() : '';
        return (
            <div className="flex items-center justify-center h-full bg-gray-50">
                <div className="text-center max-w-md px-4">
                    <div className="text-red-500 mb-4">
                        <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                            />
                        </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Failed to Load Content</h3>
                    <p className="text-gray-600 text-sm mb-4">
                        Unable to load the content{currentTenant && ` for ${currentTenant}`}. Please try again later.
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    >
                        Reload Page
                    </button>
                </div>
            </div>
        );
    };

    return (
        <RootLayoutUI>
            <div className={`w-full h-full flex flex-col ${className}`}>
                {showHeader && (
                    <div className="bg-linear-to-r from-blue-600 to-blue-700 text-end text-white px-6 py-3 shadow-md">
                        <p className="text-sm font-medium animate-pulse">
                            {headerText || `Viewing: ${new URL(src).hostname}`}
                        </p>
                    </div>
                )}

                <div className="relative flex-1">
                    {loading && (loadingComponent || defaultLoadingComponent())}
                    {error && (errorComponent || defaultErrorComponent())}

                    <iframe
                        src={src}
                        title={title}
                        className={`w-full h-full border-0 ${loading || error ? 'hidden' : ''}`}
                        sandbox={sandboxRules.join(' ')}
                        allow={allowedFeatures.join('; ')}
                        onLoad={handleLoad}
                        onError={handleError}
                        referrerPolicy="strict-origin-when-cross-origin"
                    />
                </div>
            </div>
        </RootLayoutUI>
    );
}

// Preset for Lovable embeds
export function LovableEmbed({ src, showBranding = true }: { src: string; showBranding?: boolean }) {
    const appName = process.env.NEXT_PUBLIC_APP_NAME || 'AixelLabs';
    const sandboxRulesConfig = [
        'allow-same-origin',
        'allow-scripts',
        'allow-forms',
        'allow-popups',
        'allow-popups-to-escape-sandbox',
        'allow-modals',
        'allow-downloads',
    ];
    return (
        <IframeEmbed
            src={src}
            title="Lovable App"
            showHeader={showBranding}
            headerText={`Powered by ${appName}`}
            sandboxRules={sandboxRulesConfig}
        />
    );
}
