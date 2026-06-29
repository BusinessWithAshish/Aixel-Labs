export enum YoutubeTypeFilter {
  VIDEO = "EgIQAQ%3D%3D",
  SHORTS = "EgIQCQ%3D%3D",
  CHANNEL = "EgIQAg%3D%3D",
  PLAYLIST = "EgIQAw%3D%3D",
  MOVIE = "EgIQBA%3D%3D",
}

export enum YoutubeDurationFilter {
  UNDER_3_MINUTES = "EgIYBA%3D%3D",
  BETWEEN_3_AND_20_MINUTES = "EgIYBQ%3D%3D",
  OVER_20_MINUTES = "EgIYAg%3D%3D",
}

export enum YoutubeUploadDateFilter {
  TODAY = "EgIIAg%3D%3D",
  THIS_WEEK = "EgIIAw%3D%3D",
  THIS_MONTH = "EgIIBA%3D%3D",
  THIS_YEAR = "EgIIBQ%3D%3D",
}

export enum YoutubeFeatureFilter {
  LIVE = "EgJAAQ%3D%3D",
  UHD_4K = "EgJwAQ%3D%3D",
  HD = "EgIgAQ%3D%3D",
  SUBTITLES = "EgIoAQ%3D%3D",
  CREATIVE_COMMONS = "EgIwAQ%3D%3D",
  VIDEO_360 = "EgJ4AQ%3D%3D",
  VR180 = "EgPQAQE%3D",
  VIDEO_3D = "EgI4AQ%3D%3D",
  HDR = "EgPIAQE%3D",
  LOCATION = "EgO4AQE%3D",
  PURCHASED = "EgJIAQ%3D%3D",
}

export enum YoutubeSortFilter {
  RELEVANCE = "",
  POPULARITY = "CAM%3D",
}

export const YoutubeFilters = {
  Type: YoutubeTypeFilter,
  Duration: YoutubeDurationFilter,
  UploadDate: YoutubeUploadDateFilter,
  Features: YoutubeFeatureFilter,
  Sort: YoutubeSortFilter,
} as const;

export const YOUTUBE_SEARCH_BASE_URL = "https://www.youtube.com";

export const YOUTUBE_SEARCH_DEFAULT_LIMIT = 1000;
export const YOUTUBE_SEARCH_MAX_LIMIT = 1000;
export const YOUTUBE_INNERTUBE_SEARCH_URL = `${YOUTUBE_SEARCH_BASE_URL}/youtubei/v1/search`;
