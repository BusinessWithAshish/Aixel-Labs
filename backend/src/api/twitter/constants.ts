/** Public web client bearer — shipped in X's own JS (`main.*.js`). */
export const TWITTER_WEB_BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

export const TWITTER_ORIGIN = "https://x.com";
export const TWITTER_API_ORIGIN = "https://api.x.com";
export const TWITTER_API_TWITTER_ORIGIN = "https://api.twitter.com";
export const TWITTER_SYNDICATION_ORIGIN = "https://cdn.syndication.twimg.com";
export const TWITTER_ABS_MAIN_RE =
  /https:\/\/abs\.twimg\.com\/responsive-web\/client-web\/main\.[a-z0-9]+\.js/i;

export const TWITTER_DEFAULT_COUNTRY = "US";
export const TWITTER_DEFAULT_LIMIT = 20;
export const TWITTER_MAX_LIMIT = 50;
export const TWITTER_DEFAULT_SEARCH_PAGES = 1;
export const TWITTER_MAX_SEARCH_PAGES = 3;
export const TWITTER_SEARCH_HYDRATE_CONCURRENCY = 4;
export const TWITTER_QUERY_CATALOG_TTL_MS = 6 * 60 * 60 * 1000;

export const TWITTER_SEARCH_FILTER = {
  TWEET: "tweet",
  USER: "user",
} as const;

export type TwitterSearchFilter =
  (typeof TWITTER_SEARCH_FILTER)[keyof typeof TWITTER_SEARCH_FILTER];

export const TWITTER_API_ROUTES = {
  SEARCH: "/search",
  USER: "/user",
  TWEET: "/tweet",
  TWEETS: "/tweets",
  TRENDING: "/trending",
} as const;

export const TWITTER_HANDLER_LABELS = {
  SEARCH: "TWITTER/SEARCH",
  USER: "TWITTER/USER",
  TWEET: "TWITTER/TWEET",
  TWEETS: "TWITTER/TWEETS",
  TRENDING: "TWITTER/TRENDING",
} as const;

export const TWITTER_ERROR_MESSAGES = {
  INVALID_PARAMS: "Invalid request parameters",
  USER_NOT_FOUND: "Twitter user not found",
  TWEET_NOT_FOUND: "Tweet not found",
  SEARCH_EMPTY: "No Twitter results found for this query",
  GUEST_FAILED: "Failed to obtain a Twitter guest token",
  GRAPHQL_FAILED: "Twitter GraphQL request failed",
} as const;

/** Profile path segments that are site sections, not handles. */
export const TWITTER_RESERVED_HANDLES = new Set([
  "i",
  "home",
  "explore",
  "search",
  "settings",
  "intent",
  "hashtag",
  "compose",
  "messages",
  "notifications",
  "login",
  "signup",
  "privacy",
  "tos",
  "about",
  "jobs",
  "download",
  "oauth",
  "account",
  "flow",
  "share",
  "lists",
  "moments",
  "communities",
  "grok",
  "help",
  "status",
]);

export const TWITTER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export const TWITTER_FALSE_FEATURES = new Set(["verified_phone_label_enabled"]);
export const TWITTER_FALSE_TOGGLES = new Set([
  "withPayments",
  "withGrokAnalyze",
  "withDisallowedReplyControls",
]);

export type TwitterGraphqlOperation = {
  queryId: string;
  featureSwitches: string[];
  fieldToggles: string[];
};

export const TWITTER_GRAPHQL_OPERATIONS = {
  UserByScreenName: "UserByScreenName",
  UserTweets: "UserTweets",
  TweetResultByRestId: "TweetResultByRestId",
} as const;

export type TwitterGraphqlOperationName =
  (typeof TWITTER_GRAPHQL_OPERATIONS)[keyof typeof TWITTER_GRAPHQL_OPERATIONS];

/**
 * Query IDs + feature lists harvested from X `main.*.js` (logged-out web client).
 * Rotates with X web releases — `helpers.ts` rescrapes on GraphQL 404.
 */
export const TWITTER_FALLBACK_OPERATIONS: Record<
  TwitterGraphqlOperationName,
  TwitterGraphqlOperation
> = {
  UserByScreenName: {
    queryId: "Gb-d6r0vxPOADdG62OEBpQ",
    featureSwitches: [
      "hidden_profile_subscriptions_enabled",
      "profile_label_improvements_pcf_label_in_post_enabled",
      "responsive_web_profile_redirect_enabled",
      "rweb_tipjar_consumption_enabled",
      "verified_phone_label_enabled",
      "subscriptions_verification_info_is_identity_verified_enabled",
      "subscriptions_verification_info_verified_since_enabled",
      "highlights_tweets_tab_ui_enabled",
      "responsive_web_twitter_article_notes_tab_enabled",
      "subscriptions_feature_can_gift_premium",
      "creator_subscriptions_tweet_preview_api_enabled",
      "responsive_web_graphql_timeline_navigation_enabled",
    ],
    fieldToggles: ["withPayments", "withAuxiliaryUserLabels"],
  },
  UserTweets: {
    queryId: "SXVCYB8XHSS25nzIljNtZA",
    featureSwitches: [
      "rweb_video_screen_enabled",
      "rweb_cashtags_enabled",
      "profile_label_improvements_pcf_label_in_post_enabled",
      "responsive_web_profile_redirect_enabled",
      "rweb_tipjar_consumption_enabled",
      "verified_phone_label_enabled",
      "creator_subscriptions_tweet_preview_api_enabled",
      "responsive_web_graphql_timeline_navigation_enabled",
      "premium_content_api_read_enabled",
      "communities_web_enable_tweet_community_results_fetch",
      "c9s_tweet_anatomy_moderator_badge_enabled",
      "responsive_web_grok_analyze_button_fetch_trends_enabled",
      "responsive_web_grok_analyze_post_followups_enabled",
      "rweb_cashtags_composer_attachment_enabled",
      "responsive_web_jetfuel_frame",
      "responsive_web_grok_share_attachment_enabled",
      "responsive_web_grok_annotations_enabled",
      "articles_preview_enabled",
      "responsive_web_edit_tweet_api_enabled",
      "rweb_conversational_replies_downvote_enabled",
      "graphql_is_translatable_rweb_tweet_is_translatable_enabled",
      "view_counts_everywhere_api_enabled",
      "longform_notetweets_consumption_enabled",
      "responsive_web_twitter_article_tweet_consumption_enabled",
      "content_disclosure_indicator_enabled",
      "content_disclosure_ai_generated_indicator_enabled",
      "responsive_web_grok_show_grok_translated_post",
      "responsive_web_grok_analysis_button_from_backend",
      "post_ctas_fetch_enabled",
      "freedom_of_speech_not_reach_fetch_enabled",
      "standardized_nudges_misinfo",
      "tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled",
      "longform_notetweets_rich_text_read_enabled",
      "longform_notetweets_inline_media_enabled",
      "responsive_web_grok_image_annotation_enabled",
      "responsive_web_grok_imagine_annotation_enabled",
      "responsive_web_grok_community_note_auto_translation_is_enabled",
      "responsive_web_enhance_cards_enabled",
    ],
    fieldToggles: [
      "withPayments",
      "withAuxiliaryUserLabels",
      "withArticleRichContentState",
      "withArticlePlainText",
      "withArticleSummaryText",
      "withArticleVoiceOver",
      "withGrokAnalyze",
      "withDisallowedReplyControls",
    ],
  },
  TweetResultByRestId: {
    queryId: "GZsN2Pc4knAoit6pXa4HSA",
    featureSwitches: [
      "creator_subscriptions_tweet_preview_api_enabled",
      "premium_content_api_read_enabled",
      "communities_web_enable_tweet_community_results_fetch",
      "c9s_tweet_anatomy_moderator_badge_enabled",
      "responsive_web_grok_analyze_button_fetch_trends_enabled",
      "responsive_web_grok_analyze_post_followups_enabled",
      "rweb_cashtags_composer_attachment_enabled",
      "responsive_web_jetfuel_frame",
      "responsive_web_grok_share_attachment_enabled",
      "responsive_web_grok_annotations_enabled",
      "articles_preview_enabled",
      "responsive_web_edit_tweet_api_enabled",
      "rweb_conversational_replies_downvote_enabled",
      "graphql_is_translatable_rweb_tweet_is_translatable_enabled",
      "view_counts_everywhere_api_enabled",
      "longform_notetweets_consumption_enabled",
      "responsive_web_twitter_article_tweet_consumption_enabled",
      "content_disclosure_indicator_enabled",
      "content_disclosure_ai_generated_indicator_enabled",
      "responsive_web_grok_show_grok_translated_post",
      "responsive_web_grok_analysis_button_from_backend",
      "post_ctas_fetch_enabled",
      "rweb_cashtags_enabled",
      "freedom_of_speech_not_reach_fetch_enabled",
      "standardized_nudges_misinfo",
      "tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled",
      "longform_notetweets_rich_text_read_enabled",
      "longform_notetweets_inline_media_enabled",
      "profile_label_improvements_pcf_label_in_post_enabled",
      "responsive_web_profile_redirect_enabled",
      "rweb_tipjar_consumption_enabled",
      "verified_phone_label_enabled",
      "responsive_web_grok_image_annotation_enabled",
      "responsive_web_grok_imagine_annotation_enabled",
      "responsive_web_grok_community_note_auto_translation_is_enabled",
      "responsive_web_graphql_timeline_navigation_enabled",
    ],
    fieldToggles: [
      "withArticleRichContentState",
      "withArticlePlainText",
      "withArticleSummaryText",
      "withArticleVoiceOver",
      "withGrokAnalyze",
      "withDisallowedReplyControls",
      "withPayments",
      "withAuxiliaryUserLabels",
    ],
  },
};

/** Yahoo WOEIDs for `GET /1.1/trends/place.json` (country-level, guest-ok). */
export const TWITTER_WOEID_BY_COUNTRY: Record<string, number> = {
  AE: 23424738,
  AR: 23424747,
  AT: 23424750,
  AU: 23424748,
  BE: 23424757,
  BH: 23424753,
  BR: 23424768,
  BY: 23424765,
  CA: 23424775,
  CH: 23424957,
  CL: 23424782,
  CO: 23424787,
  DE: 23424829,
  DK: 23424796,
  DO: 23424800,
  DZ: 23424740,
  EC: 23424801,
  EG: 23424802,
  ES: 23424950,
  FR: 23424819,
  GB: 23424975,
  GH: 23424824,
  GR: 23424833,
  GT: 23424834,
  ID: 23424846,
  IE: 23424803,
  IL: 23424852,
  IN: 23424848,
  IT: 23424853,
  JO: 23424860,
  JP: 23424856,
  KE: 23424863,
  KR: 23424868,
  KW: 23424870,
  LB: 23424873,
  LV: 23424874,
  MX: 23424900,
  MY: 23424901,
  NG: 23424908,
  NL: 23424909,
  NO: 23424910,
  NZ: 23424916,
  OM: 23424898,
  PA: 23424924,
  PE: 23424919,
  PH: 23424934,
  PK: 23424922,
  PL: 23424923,
  PR: 23424935,
  PT: 23424925,
  QA: 23424930,
  RU: 23424936,
  SA: 23424938,
  SE: 23424954,
  SG: 23424948,
  TH: 23424960,
  TR: 23424969,
  UA: 23424976,
  US: 23424977,
  VE: 23424982,
  VN: 23424984,
  ZA: 23424942,
};

export const TWITTER_WOEID_WORLDWIDE = 1;

export const TWITTER_GSEARCH_TWEET_OPERATOR = "site:x.com inurl:/status/";
export const TWITTER_GSEARCH_USER_OPERATOR = 'site:x.com intitle:"(@"';
