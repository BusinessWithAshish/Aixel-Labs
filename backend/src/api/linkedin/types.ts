import { z } from "zod";
import {
  LINKEDIN_BY_COMPANY_REQUEST_SCHEMA,
  LINKEDIN_BY_PEOPLE_REQUEST_SCHEMA,
  LINKEDIN_SEARCH_TYPE,
} from "./schemas";

export type LINKEDIN_BY_PEOPLE_REQUEST = z.infer<
  typeof LINKEDIN_BY_PEOPLE_REQUEST_SCHEMA
>;
export type LINKEDIN_BY_COMPANY_REQUEST = z.infer<
  typeof LINKEDIN_BY_COMPANY_REQUEST_SCHEMA
>;

export type LINKEDIN_BY_PEOPLE_RESPONSE = {
  searchType: typeof LINKEDIN_SEARCH_TYPE.PEOPLE;
  id: string | null;
  url: string | null;
  name: string | null;
  headline: string | null;
  job_titles: string[] | null;
  description: string | null;
  profile_photo_url: string | null;
  profile_background_url: string | null;
  follower_count: number | null;

  contact_info_url: string | null;

  profile_links: string[] | null;

  direct_message_url: string | null;

  languages: string[] | null;

  address: {
    locality: string | null;
    country: string | null;
  };

  awards: string[] | null;
  member_of: string[] | null;

  /** alumniOf (EducationalOrganization) */
  education: {
    name: string | null;
    url: string | null;
    location: string | null;
    start_date: string | null;
    description: string | null;
    degree: string | null;
    end_date: string | null;
  }[];

  /** alumniOf (Organization) */
  past_experience: {
    name: string | null;
    url: string | null;
    location: string | null;
    start_date: string | null;
    description: string | null;
    position: string | null;
    end_date: string | null;
  }[];

  /** worksFor (Organization) */
  current_experience: {
    name: string | null;
    url: string | null;
    location: string | null;
    start_date: string | null;
    description: string | null;
    position: string | null;
    end_date: string | null;
  }[];

  /** Pulse articles embedded in the profile JSON-LD. */
  pulse_articles: {
    headline: string | null;
    url: string | null;
    date_published: string | null;
    date_modified: string | null;
    cover_image_url: string | null;
    like_count: number | null;
  }[];

  /** Books / publications (`PublicationIssue`). */
  publications: {
    name: string | null;
    url: string | null;
  }[];

  /** Recent public posts (`DiscussionForumPosting` with activity URL). */
  recent_posts: {
    headline: string | null;
    text: string | null;
    url: string | null;
    date_published: string | null;
    like_count: number | null;
    main_entity_url: string | null;
  }[];

  last_post_date: string | null;

  similar_profiles: {
    name: string | null;
    url: string | null;
    follower_count: number | null;
    location: string | null;
    profile_photo_url: string | null;
  }[];
};

export type LINKEDIN_BY_COMPANY_META_HIDDEN_INFO = {
  url: string;
  name: string;
  description: string;
  number_of_employees: number;
  logo_url: string;
  logo_description: string;
  address: {
    locality: string;
    region: string;
    country: string;
    code: string;
  };
};

export type LINKEDIN_BY_COMPANY_RESPONSE = {
  searchType: typeof LINKEDIN_SEARCH_TYPE.COMPANY;
  id: string | null;
  name: string | null;
  url: string | null;
  description: string | null;
  taglines: string[] | null;
  website: string | null;
  headquaters: string | null;
  industry: string | null;
  company_size: string | null;
  employee_count: number | null;
  company_type: string | null;
  specialties: string | null;
  similar_pages: {
    name: string | null;
    description: string | null;
    url: string | null;
  }[];
  affiliated_pages: {
    name: string | null;
    description: string | null;
    url: string | null;
  }[];
  followers: number | null;
  logo_url: string | null;
  logo_description: string | null;
  cover_photo: string | null;
  funding_info: {
    total_rounds: number | null;
    last_round_date: string | null;
    last_round_type: string | null;
    last_round_amount: string | null;
    investors: string[] | null;
  } | null;
  recent_posts: {
    time: string | null;
    comments: number | null;
    reactions: number | null;
    url: string | null;
  }[];
  last_post_date: string | null;
  is_hiring: boolean | null;
  address: {
    locality: string | null;
    region: string | null;
    country: string | null;
    code: string | null;
  };
};
