import { generateGoogleMapsUrls } from "./helpers";
import { Request, Response } from "express";
import { BrowserBatchHandler } from "../../../utils/browser-batch-handler";
import { scrapeLinks } from "./helpers";
import { GMAPS_SCRAPE_RESPONSE } from "./types";
import { GmapsDetailsLeadInfoExtractor } from "./helpers";
import { GMAPS_REQUEST_SCHEMA } from "../schemas";

// ─── Handler: POST /gmaps/scrape ───────────────────────────
export const gmapsScrapeHandler = async (req: Request, res: Response) => {
  const requestBody = req.body;
  const parsedBody = GMAPS_REQUEST_SCHEMA.safeParse(requestBody);

  if (!parsedBody.success) {
    res.status(400).json({ success: false, error: "Invalid query parameters" });
    return;
  }

  const finalScrappingUrls = generateGoogleMapsUrls(parsedBody.data);

  if (finalScrappingUrls.length === 0) {
    res.status(400).json({ success: false, error: "No URLs provided" });
    return;
  }

  try {
    console.log(
      `Starting Google Maps scraping for "${parsedBody.data.query}" in ${parsedBody.data.state} state`,
    );
    console.log(`Total URLs to scrape: ${finalScrappingUrls.length}`);

    console.log("Phase 1: Searching for business listings...");
    const foundedLeads = await BrowserBatchHandler({
      urlItems: finalScrappingUrls,
      scrapingFunction: scrapeLinks,
      res: null,
      allowBatchWaiting: true,
    });

    const foundedLeadsResults = foundedLeads.results.flat();

    if (foundedLeadsResults.length === 0) {
      const response: GMAPS_SCRAPE_RESPONSE = {
        founded: [],
        foundedLeadsCount: 0,
        allLeads: [],
        allLeadsCount: 0,
      };

      res.status(200).json({
        success: true,
        message: "No business listings found",
        data: response,
      });
      return;
    }

    console.log(
      `Phase 2: Extracting details from ${foundedLeadsResults.length} business listings...`,
    );
    const allLeads = await BrowserBatchHandler({
      urlItems: foundedLeadsResults,
      scrapingFunction: GmapsDetailsLeadInfoExtractor,
      res: null,
      allowBatchWaiting: true,
    });
    const allLeadsResults = allLeads.results.flat();

    const response: GMAPS_SCRAPE_RESPONSE = {
      founded: foundedLeadsResults,
      foundedLeadsCount: foundedLeadsResults.length,
      allLeads: allLeadsResults,
      allLeadsCount: allLeadsResults.length,
    };

    res.status(200).json({
      success: true,
      message: "Scraping completed successfully!",
      data: response,
    });
  } catch (error) {
    console.error("Scraping failed:", error);
    res.status(500).json({
      success: false,
      error: "Scraping failed due to system error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
