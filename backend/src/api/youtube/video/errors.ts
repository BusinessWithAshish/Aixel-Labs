export class YoutubeVideoError extends Error {
  constructor(
    message: string,
    readonly statusCode: 404 | 502,
  ) {
    super(message);
    this.name = "YoutubeVideoError";
  }
}
