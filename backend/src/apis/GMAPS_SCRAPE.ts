import { Request, Response } from 'express'
import { GMAPS_SCRAPE_REQUEST_SCHEMA, GMAPS_SCRAPE_RESPONSE, generateGoogleMapsUrls } from "@aixellabs/shared/apis";
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
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send initial message
  res.write(`data: ${JSON.stringify({
    type: 'status',
    message: `Starting Google Maps scraping for "${parsedBody.data.query}" in ${parsedBody.data.states.length} states`,
    data: {
      total: finalScrappingUrls.length,
      stage: 'api_start'
    },
    timestamp: new Date().toISOString()
  })}\n\n`);

  try {
    // Phase 1: Scrape business listing URLs
    res.write(`data: ${JSON.stringify({
      type: 'status',
      message: 'Phase 1: Searching for business listings...',
      data: {
        stage: 'phase_1_start',
        phase: 1
      },
      timestamp: new Date().toISOString()
    })}\n\n`);

    const foundedLeads = await BrowserBatchHandler(finalScrappingUrls, scrapeLinks, res);

    const foundedLeadsResults = foundedLeads.results.flat();

    // If no business listings found, send final message and end the response
    if (foundedLeadsResults.length === 0) {

      const response: GMAPS_SCRAPE_RESPONSE = {
        founded: [],
        foundedLeadsCount: 0,
        allLeads: [],
        allLeadsCount: 0
      };

      res.write(`data: ${JSON.stringify({
        type: 'complete',
        message: 'No business listings found',
        data: response,
        timestamp: new Date().toISOString()
      })}\n\n`);
      res.end();
      return;
    }

    // Phase 2: Extract detailed business information from the business listings
    res.write(`data: ${JSON.stringify({
      type: 'status',
      message: `Phase 2: Extracting details from ${foundedLeadsResults.length} business listings...`,
      data: {
        stage: 'phase_2_start',
        phase: 2,
        total: foundedLeadsResults.length
      },
      timestamp: new Date().toISOString()
    })}\n\n`);

    const allLeads = await BrowserBatchHandler(foundedLeadsResults, GmapsDetailsLeadInfoExtractor, res);
    const allLeadsResults = allLeads.results.flat();

    const response: GMAPS_SCRAPE_RESPONSE = {
      founded: foundedLeadsResults,
      foundedLeadsCount: foundedLeadsResults.length,
      allLeads: allLeadsResults,
      allLeadsCount: allLeadsResults.length
    };

    // Send final results
    res.write(`data: ${JSON.stringify({
      type: 'complete',
      message: 'Scraping completed successfully!',
      data: response,
      timestamp: new Date().toISOString()
    })}\n\n`);

    res.end();
  } catch (error) {
    res.write(`data: ${JSON.stringify({
      type: 'error',
      message: 'Scraping failed due to system error',
      data: {
        stage: 'api_error',
        error: error instanceof Error ? error.message : String(error)
      },
      timestamp: new Date().toISOString()
    })}\n\n`);
    res.end();
  }
};