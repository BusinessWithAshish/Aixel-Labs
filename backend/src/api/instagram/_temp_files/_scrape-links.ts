// export const instagramScrapeLinks = async (
//   finalUrl: string,
// ): Promise<string[]> => {
//   const response = await fetch(
//     `${process.env.SCRAPER_URL}/api/scrape?url=${encodeURIComponent(finalUrl)}`,
//     {
//       method: "GET",
//       headers: {
//         "Content-Type": "application/json",
//       },
//     },
//   );
//   const responseJson = await response.json();

//   const { success, data, error } = responseJson;

//   if (!success || data.length === 0) {
//     throw new Error("Failed to scrape Instagram URLs");
//   }

//   const santizedInstagramUrls: string[] = data.filter((url: string) => {
//     const usernameRegex = /^https:\/\/www\.instagram\.com\/[a-zA-Z0-9_-]+\/$/;
//     if (usernameRegex.test(url)) {
//       return true;
//     }
//     return false;
//   });

//   return santizedInstagramUrls;
// };
