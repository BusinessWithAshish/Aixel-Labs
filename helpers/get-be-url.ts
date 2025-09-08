

export const getBeUrl  = (path?: string) => {

    const url = process.env.NODE_ENV === "development"
        ? "http://localhost:8100"
        : process.env.NEXT_PUBLIC_AIXELLABS_BE_URL;
    return new URL(`${url}${path}`);
}