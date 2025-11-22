export const getTenantCurrentByUrl = (): string | null => {
    try {
        const url = new URL(window.location.href);
        const hostname = url.hostname;
        const parts = hostname.split('.');
        return parts.length > 1 ? parts[0] : null;
    } catch (error) {
        console.error('Error getting tenant current by URL:', error);
        return null;
    }
};
