import z from "zod";
import { Request, Response } from 'express'
import dotenv from "dotenv"
dotenv.config()
import {GOOGLE_MAPS_TEXT_FREE_FIELD_MASKS, GOOGLE_MAPS_TEXTSEARCH_API_URL} from "../utils/constants";
import {generateGoogleMapsUrls} from "../utils/helpers";

export const POSTv3ScrapeSchema = z.object({
    query: z.string(),
    country: z.string(),
    states: z.array(z.object({
        name: z.string(),
        cities: z.array(z.string())
    }))
})

export const GMAPS_SEARCH_API_SCRAPE =  async (req: Request, res: Response) => {

    const requestBody = req.body;

    const parsedBody = POSTv3ScrapeSchema.safeParse(requestBody);

    if (!parsedBody.success) {
        res.status(400).json({ error: "Invalid query parameters" });
        return;
    }

    const finalScrappingUrls = generateGoogleMapsUrls(parsedBody.data);

    if (finalScrappingUrls.length === 0) {
        res.status(400).json({ error: "No URLs provided" });
        return;
    }

    let allPlaces: any[] = [];
    let pageToken: string | undefined = undefined;

    do {

        // @ts-ignore
        const response = await fetch(GOOGLE_MAPS_TEXTSEARCH_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': process.env.GOOGLE_MAPS_PLACES_API_KEY as string,
                'X-Goog-FieldMask': GOOGLE_MAPS_TEXT_FREE_FIELD_MASKS
            },
            body: JSON.stringify({
                textQuery: parsedBody.data?.query,
                pageToken: pageToken ? pageToken : '',
            })
        });

        // @ts-ignore
        const data = await response.json();

        allPlaces.push(...(data.places || []));
        pageToken = data.nextPageToken;

        // Optional delay if token requires wait (see note below)
        await new Promise(r => setTimeout(r, 1000));

    } while (pageToken);

    res.send({ success: true, data: allPlaces });
};