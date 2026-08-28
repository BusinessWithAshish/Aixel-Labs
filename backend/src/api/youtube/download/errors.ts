export class YoutubeDownloadError extends Error {
  constructor(
    message: string,
    readonly statusCode: 400 | 404 | 501 | 502,
  ) {
    super(message);
    this.name = "YoutubeDownloadError";
  }
}
