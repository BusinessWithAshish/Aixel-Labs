import { fetchInstagramAdvancedPosts } from "../../advanced/client";
import { fetchFromEntities } from "../../client";
import { enrichPost } from "./enrich";
import type {
  INSTAGRAM_ACCOUNT_INTELLIGENCE_RESPONSE,
  InstagramAccountIntelligenceInput,
} from "./types";

export async function instagramAccountIntelligenceService(
  input: InstagramAccountIntelligenceInput,
): Promise<INSTAGRAM_ACCOUNT_INTELLIGENCE_RESPONSE> {
  const [profile] = await fetchFromEntities(
    [input.username],
    input.country,
    1,
  );
  const harvestedAt = new Date();

  // Posts tab isn't reachable for private accounts — return profile stats
  // only rather than letting the posts fetch fail downstream.
  if (profile?.isPrivate) {
    return {
      username: input.username,
      followers: profile.followers,
      isPrivate: true,
      isBusiness: profile.isBusiness,
      posts: [],
    };
  }

  const { posts } = await fetchInstagramAdvancedPosts({
    username: input.username,
    pages: input.pages,
  });

  return {
    username: input.username,
    followers: profile?.followers ?? null,
    isPrivate: profile?.isPrivate ?? null,
    isBusiness: profile?.isBusiness ?? null,
    posts: posts.map((post) =>
      enrichPost(post, profile?.followers ?? null, harvestedAt),
    ),
  };
}
