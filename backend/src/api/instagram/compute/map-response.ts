import type { CountryCode } from "libphonenumber-js";

import { INSTAGRAM_ERROR_MESSAGES } from "../constants";
import type { INSTAGRAM_RESPONSE, InstagramUser } from "../types";
import { collectBusinessPhoneNumbers } from "./phones";
import { instagramProfileUrl } from "./username";

export function mapToResponse(
  user: InstagramUser["data"]["user"],
  country: CountryCode,
): INSTAGRAM_RESPONSE {
  const bioEntities = user.biography_with_entities?.entities ?? [];

  const bioHashtags = bioEntities
    .filter((e) => e.hashtag?.name)
    .map((e) => e.hashtag.name);

  const bioMentions = bioEntities
    .filter((e) => e.user?.username)
    .map((e) => e.user.username);

  const websites = (user.bio_links ?? []).map((l) => l.url).filter(Boolean);

  return {
    id: user.id ?? null,
    fullName: user.full_name ?? null,
    username: user.username ?? null,
    instagramUrl: user.username ? instagramProfileUrl(user.username) : null,
    websites: websites.length > 0 ? websites : null,
    bio: user.biography ?? null,
    bioHashtags: bioHashtags.length > 0 ? bioHashtags : null,
    bioMentions: bioMentions.length > 0 ? bioMentions : null,
    followers: user.edge_followed_by?.count ?? null,
    following: user.edge_follow?.count ?? null,
    posts: user.edge_owner_to_timeline_media?.count ?? null,
    profilePicture: user.profile_pic_url ?? null,
    profilePictureHd: user.profile_pic_url_hd ?? null,
    isVerified: user.is_verified ?? null,
    isBusiness: user.is_business_account ?? null,
    isProfessional: user.is_professional_account ?? null,
    isPrivate: user.is_private ?? null,
    isJoinedRecently: user.if_joined_recently ?? null,
    businessEmail: user.business_email ?? null,
    businessPhoneNumber: collectBusinessPhoneNumbers(
      user.business_phone_number,
      user.biography,
      country,
    ),
    businessCategoryName: user.business_category_name ?? null,
    overallCategoryName: user.overall_category_name ?? null,
    businessAddressJson: user.business_address_json ?? null,
  };
}

export function mapInstagramWebProfileBody(
  text: string,
  country: CountryCode,
): INSTAGRAM_RESPONSE {
  const json = JSON.parse(text) as InstagramUser;
  const user = json?.data?.user;
  if (!user) throw new Error(INSTAGRAM_ERROR_MESSAGES.PROFILE_MISSING_USER);
  return mapToResponse(user, country);
}
