import { Request, Response } from "express";
import {
  GMAPS_SCRAPE_REQUEST_SCHEMA,
  GMAPS_SCRAPE_RESPONSE,
  generateGoogleMapsUrls,
} from "@aixellabs/shared/apis";
import { BrowserBatchHandler } from "../functions/common/browser-batch-handler.js";
import { scrapeLinks } from "../functions/scrape-links.js";
import { GmapsDetailsLeadInfoExtractor } from "../functions/gmap-details-lead-extractor.js";

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

  // Set up Server-Sent Events headers for streaming
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": req.headers.origin || "*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, Cache-Control, X-Requested-With",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  });

  // Helper to serialize and send stream messages
  const serializeMessage = (type: string, message: string, data?: Record<string, unknown>): string => {
    return `data: ${JSON.stringify({
      type,
      message,
      data,
      timestamp: new Date().toISOString(),
    })}\n\n`;
  };

  const sendMessage = (type: string, message: string, data?: Record<string, unknown>) => {
    res.write(serializeMessage(type, message, data));
  };

  sendMessage("status", `Starting Google Maps scraping for "${parsedBody.data.query}" in ${parsedBody.data.states.length} states`, {
    total: finalScrappingUrls.length,
    stage: "api_start",
  });

  try {
    sendMessage("status", "Phase 1: Searching for business listings...", {
      stage: "phase_1_start",
      phase: 1,
    });

    const foundedLeads = await BrowserBatchHandler(
      finalScrappingUrls,
      scrapeLinks,
      res
    );

    const foundedLeadsResults = foundedLeads.results.flat();

    if (foundedLeadsResults.length === 0) {
      const response: GMAPS_SCRAPE_RESPONSE = {
        founded: [],
        foundedLeadsCount: 0,
        allLeads: [],
        allLeadsCount: 0,
      };

      sendMessage("complete", "No business listings found", response);
      res.end();
      return;
    }

    sendMessage("status", `Phase 2: Extracting details from ${foundedLeadsResults.length} business listings...`, {
      stage: "phase_2_start",
      phase: 2,
      total: foundedLeadsResults.length,
    });

    const allLeads = await BrowserBatchHandler(
      foundedLeadsResults,
      GmapsDetailsLeadInfoExtractor,
      res
    );
    const allLeadsResults = allLeads.results.flat();

    const response: GMAPS_SCRAPE_RESPONSE = {
      founded: foundedLeadsResults,
      foundedLeadsCount: foundedLeadsResults.length,
      allLeads: allLeadsResults,
      allLeadsCount: allLeadsResults.length,
    };

    sendMessage("complete", "Scraping completed successfully!", response);
    res.end();
  } catch (error) {
    sendMessage("error", "Scraping failed due to system error", {
      stage: "api_error",
      error: error instanceof Error ? error.message : String(error),
    });
    res.end();
  }
};
