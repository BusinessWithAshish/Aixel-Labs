import {TApiResponse} from "@/types/api";

export type Lead = {
    id: string;
    name: string;
    overAllRating: string;
    phoneNumber: string;
    numberOfReviews: string;
    website?: string;
};

export type GmapsData = {
    foundedLeads: string[];
    foundedLeadsCount: number;
    actualLeads: Lead[];
    actualLeadsCount: number;
}

export type TGmapsScrapeResult = TApiResponse<GmapsData>