
export const getBeUrl = (path?: string, baseUrl?: string) => {
    // Use provided baseUrl or default to localhost
    const url = baseUrl || "http://localhost:8100";

    // Ensure baseUrl has protocol
    const cleanBaseUrl = url.startsWith('http://') || url.startsWith('https://') 
        ? url 
        : `http://${url}`;

    // Ensure baseUrl doesn't end with slash
    const finalBaseUrl = cleanBaseUrl.replace(/\/$/, '');

    // Ensure path starts with slash
    const cleanPath = path ? (path.startsWith('/') ? path : `/${path}`) : '';

    return new URL(`${finalBaseUrl}${cleanPath}`);
};