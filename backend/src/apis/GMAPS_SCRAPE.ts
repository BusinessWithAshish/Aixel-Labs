import { Request, Response } from "express";
import {
  GMAPS_SCRAPE_REQUEST_SCHEMA,
  GMAPS_SCRAPE_RESPONSE,
  generateGoogleMapsUrls,
} from "@aixellabs/shared/common/apis";
import { BrowserBatchHandler } from "../functions/common/browser-batch-handler.js";
import { scrapeLinks } from "../functions/gmaps/gmaps-scrape-links.js";
import { GmapsDetailsLeadInfoExtractor } from "../functions/gmaps/gmaps-details-lead-extractor.js";

export const GMAPS_SCRAPE = async (req: Request, res: Response) => {
  const requestBody = req.body;

  const parsedBody = GMAPS_SCRAPE_REQUEST_SCHEMA.safeParse(requestBody);

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

    // Phase 1: Search for business listings
    console.log("Phase 1: Searching for business listings...");
    const foundedLeads = await BrowserBatchHandler(
      finalScrappingUrls,
      scrapeLinks,
      null,
    );

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

    // Phase 2: Extract details from business listings
    console.log(
      `Phase 2: Extracting details from ${foundedLeadsResults.length} business listings...`,
    );
    const allLeads = await BrowserBatchHandler(
      foundedLeadsResults,
      GmapsDetailsLeadInfoExtractor,
      null,
    );
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
