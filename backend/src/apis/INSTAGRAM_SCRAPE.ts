import { Request, Response } from "express";
import {
  INSTAGRAM_SCRAPE_REQUEST_SCHEMA,
  INSTAGRAM_SCRAPE_SEARCH_FOR,
  INSTAGRAM_SEARCH_SCRAPE_LEAD_INFO,
  INSTAGRAM_SCRAPE_RESPONSE,
} from "@aixellabs/shared/common";
import {
  BrowserBatchHandler,
} from "../functions/common/browser-batch-handler.js";
import {
  instagramScrapeV1,
  scrapeLeadsFromPage,
} from "../functions/instagram-scrape-v1.js";

export const INSTAGRAM_SCRAPE = async (req: Request, res: Response) => {
  const requestBody = req.body;

  const parsedBody = INSTAGRAM_SCRAPE_REQUEST_SCHEMA.safeParse(requestBody);

  if (!parsedBody.success) {
    res.status(400).json({ success: false, error: "Invalid query parameters" });
    return;
  }

  if (parsedBody.data.searchFor === INSTAGRAM_SCRAPE_SEARCH_FOR.USERNAMES) {
    const response: INSTAGRAM_SCRAPE_RESPONSE = {
      founded: ["Api is not implemented yet"],
      foundedLeadsCount: 0,
      allLeads: [],
      allLeadsCount: 0,
    };
    res.status(200).json(response);
    return;
  }

  if (parsedBody.data.searchFor === INSTAGRAM_SCRAPE_SEARCH_FOR.QUERY) {
    const queryData = parsedBody.data.query;

    const sampleQuery = `site:instagram.com (cafe OR restaurant) "Zurich"`;
    const queryUrl = `https://www.google.com/search?q=${encodeURIComponent(
      sampleQuery
    )}`;

    try {
      const firstPageResult = await BrowserBatchHandler(
        [queryUrl],
        instagramScrapeV1,
        res
      );

      console.log(
        "🔍 [Instagram API] First page result:",
        JSON.stringify(firstPageResult, null, 2)
      );

      if (!firstPageResult.success || firstPageResult.results.length === 0) {
        res.status(400).json({
          success: false,
          error:
            "Failed to scrape first page All errors: " +
            firstPageResult.errors.join(", "),
        });
        return;
      }

      const firstPageData = firstPageResult.results[0];

      let allLeads: INSTAGRAM_SEARCH_SCRAPE_LEAD_INFO[] = [
        ...firstPageData.leads,
      ];
      const paginationUrls = firstPageData.paginationUrls;

      if (!paginationUrls || paginationUrls.length === 0) {
        res.status(400).json({
          success: false,
          error: "No pagination URLs found",
        });
        return;
      }

      // Step 2: Scrape pagination URLs in parallel using BrowserBatchHandler
      const paginationResults = await BrowserBatchHandler(
        paginationUrls,
        scrapeLeadsFromPage,
        res
      );

      if (
        !paginationResults.success ||
        paginationResults.results.length === 0
      ) {
        res.status(400).json({
          success: false,
          error:
            "Failed to scrape pagination URLs. All errors: " +
            paginationResults.errors.join(", "),
        });
        return;
      }

      const paginationLeads = paginationResults.results.flat();

      allLeads = [...allLeads, ...paginationLeads];

      const foundedLeads = [
        ...firstPageData.leads.map((lead) => lead.username || ""),
        ...paginationLeads.map((lead) => lead.username || ""),
      ];

      const response: INSTAGRAM_SCRAPE_RESPONSE = {
        founded: foundedLeads,
        foundedLeadsCount: foundedLeads.length,
        allLeads: allLeads,
        allLeadsCount: allLeads.length,
      };

      res.status(200).json(response);
    } catch (error) {
      console.error("🔴 [Instagram API] Error:", error);
      res.status(500).json({
        success: false,
        error: "Scraping failed due to system error",
      });
    }
  }
};
