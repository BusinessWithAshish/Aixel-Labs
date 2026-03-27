/** Why profile fetch failed (your API may still return HTTP 404 for several of these). */
export type InstagramProfileFetchFailure =
    | 'instagram_user_not_found' // IG returned HTTP 404
    | 'no_user_payload' // HTTP 200 but `data.user` is missing — typical for private/restricted accounts without login
    | 'bad_http_status' // other non-OK responses we don't retry
    | 'parse_error'
    | 'retries_exhausted' // 429 / 5xx after all attempts
    | 'request_failed'; // timeout, proxy, connection errors after retries

export type FetchInstagramProfileResult =
    | { ok: true; profile: InstagramResponse }
    | { ok: false; failure: InstagramProfileFetchFailure; detail?: string };

export type InstagramResponse = {
    id: string | null;
    fullName: string | null;
    username: string | null;
    instagramUrl: string | null;
    websites: string[] | null;
    bio: string | null;
    bioHashtags: string[] | null;
    bioMentions: string[] | null;
    followers: number | null;
    following: number | null;
    posts: number | null;
    profilePicture: string | null;
    profilePictureHd: string | null;
    isVerified: boolean | null;
    isBusiness: boolean | null;
    isProfessional: boolean | null;
    isPrivate: boolean | null;
    isJoinedRecently: boolean | null;
    businessEmail: string | null;
    businessPhoneNumber: string | null;
    businessCategoryName: string | null;
    overallCategoryName: string | null;
    businessAddressJson: string | null;
    latestPostUrls: string[] | null;
};
