// import { Page } from "puppeteer";
// import {
//   BrowserBatchHandler,
//   browserDebugger,
// } from "../../../utils/browser-batch-handler";
// import { INSTAGRAM_REQUEST_SCHEMA } from "../schemas";
// import { INSTAGRAM_REQUEST } from "../types";
// import { Request, Response } from "express";
// import { INSTAGRAM_BASE_URL } from "../constants";

// export const instagramApiHandler2 = async (req: Request, res: Response) => {
//   //   const requestBody = req.body;

//   //   const parsedBody = INSTAGRAM_REQUEST_SCHEMA.safeParse(requestBody);

//   //   if (!parsedBody.success) {
//   //     res.status(400).json({ success: false, error: "Invalid query parameters" });
//   //     return;
//   //   }

//   const sampleRequestBody: INSTAGRAM_REQUEST = {
//     urls: ["https://www.instagram.com/leomessi/"],
//     usernames: ["leomessi"],
//     query: "leomessi",
//     country: "US",
//     // states: [{ name: "California", cities: ["San Francisco", "Los Angeles"] }],
//     hashtags: ["football", "soccer"],
//     keywords: ["football", "soccer"],
//   };

//   const parsedBody = INSTAGRAM_REQUEST_SCHEMA.safeParse(sampleRequestBody);

//   if (!parsedBody.success) {
//     res.status(400).json({ success: false, error: "Invalid query parameters" });
//     return;
//   }

//   const requestBody = parsedBody.data;

//   const sampleUrl = `${INSTAGRAM_BASE_URL}/leomessi`;

//   await BrowserBatchHandler([sampleUrl], async (url: string, page: Page) => {
//     await page.authenticate({
//       username: process.env.EVOMI_USERNAME ?? "businesswi5",
//       password: process.env.EVOMI_PASSWORD ?? "xYPLYvYQaw22xqDfWfi5",
//     });

//     await page.goto(url);
//     await browserDebugger(200000);
//     return null;
//   });

//   return res.status(200).json({ success: true, data: requestBody });
// };
