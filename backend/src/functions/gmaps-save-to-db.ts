// @ts-nocheck
import { Db, Collection } from 'mongodb';
import {TGoogleMapItem, TGoogleMapLeadInfo} from "./gmap-details-lead-extractor";

// Helper function to convert scraped data to your DB format
const formatLeadsForDB = (scrapeData: TGoogleMapItem[]): TGoogleMapLeadInfo[] => {
  if (!Array.isArray(scrapeData)) return [];

  return scrapeData.filter(lead => !lead || lead.leadInfo === null).map(item => {

    const lead = item.leadInfo!;
    return {
      name: lead.name,
      phoneNumber: lead.phoneNumber,
      website: lead.website,
      gmapsUrl: lead.gmapsUrl,
      overAllRating: lead.overAllRating,
      numberOfReviews: lead.numberOfReviews
    };
  });
};

// Helper function to create query slug
const createQuerySlug = (query: string): string => {
  return query.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-').trim();
};

const formatTimestamp = (): string => {
  const date = new Date();
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  const day = date.getDate();
  const suffix = day === 1 || day === 21 || day === 31 ? 'st' :
    day === 2 || day === 22 ? 'nd' :
      day === 3 || day === 23 ? 'rd' : 'th';
  return `${day}${suffix} ${months[date.getMonth()]} ${date.getFullYear()}`;
};

// Main function to upsert scraping results to DB
const upsertScrapingResults = async (
  db: Db,
  country: string,
  state: string,
  city: string,
  query: string,
  scrapeData: any[]
): Promise<void> => {
  try {
    const collection: Collection = db.collection(country.toLowerCase());
    const formattedLeads = formatLeadsForDB(scrapeData);
    const querySlug = createQuerySlug(query);

    if (formattedLeads.length === 0) return;

    await collection.createIndex({ state: 1 });

    // Check if state document exists
    const existingStateDoc = await collection.findOne({ state });

    if (!existingStateDoc) {
      const newStateDoc = {
        state,
        cities: [{
          city_name: city,
          queries: [{
            search_query: query,
            query_slug: querySlug,
            leads: formattedLeads
          }]
        }],
        timestamp: formatTimestamp()
      };

      await collection.insertOne(newStateDoc);
      console.log(`✅ Created state ${state} with city ${city}`);
      return;
    }

    // State exists, check if city exists
    const cityIndex = existingStateDoc.cities.findIndex((c: any) => c.city_name === city);

    if (cityIndex === -1) {
      await collection.updateOne(
          { state },
          {
            // @ts-ignore
            $push: {
            cities: {
              city_name: city,
              queries: [{
                search_query: query,
                query_slug: querySlug,
                leads: formattedLeads
              }]
            }
          },
          $set: { timestamp: formatTimestamp() }
        }
      );
      console.log(`✅ Added city ${city} to state ${state}`);
      return;
    }

    // City exists, check if query exists
    const existingCity = existingStateDoc.cities[cityIndex];
    const queryIndex = existingCity.queries.findIndex((q: any) => q.query_slug === querySlug);

    if (queryIndex === -1) {
      await collection.updateOne(
          { state, "cities.city_name": city },
          {
            // @ts-ignore
            $push: {
            "cities.$.queries": {
              search_query: query,
              query_slug: querySlug,
              leads: formattedLeads
            }
          },
          $set: { timestamp: formatTimestamp() }
        }
      );
      console.log(`✅ Added query "${query}" to ${city}, ${state}`);
    } else {
      await collection.updateOne(
        { state, "cities.city_name": city, "cities.queries.query_slug": querySlug },
        {
          //@ts-ignore
          $push: { "cities.$[city].queries.$[query].leads": { $each: formattedLeads } },
          $set: { timestamp: formatTimestamp() }
        },
        {
          arrayFilters: [
            { "city.city_name": city },
            { "query.query_slug": querySlug }
          ]
        }
      );
      console.log(`✅ Appended leads to existing query "${query}" in ${city}, ${state}`);
    }

  } catch (error) {
    console.error(`❌ Database upsert failed for ${city}, ${state}:`, error);
    throw error;
  }
};

// Export the upsert function to use in your main scraping file
export { upsertScrapingResults };