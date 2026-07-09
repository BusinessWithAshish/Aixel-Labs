import { ALApiResponse } from "../types";
import { fetchLinkedInByCompany, fetchLinkedInByPeople } from "./helpers";
import { Request, Response } from "express";
import {
  LINKEDIN_BY_COMPANY_REQUEST_SCHEMA,
  LINKEDIN_BY_PEOPLE_REQUEST_SCHEMA,
  LINKEDIN_SEARCH_TYPE,
} from "./schemas";
import {
  LINKEDIN_BY_COMPANY_RESPONSE,
  LINKEDIN_BY_PEOPLE_RESPONSE,
} from "./types";

export const linkedinApiHandler = async (req: Request, res: Response) => {
  try {
    const { body } = req;
    const searchType = body?.searchType;

    // Route by explicit discriminant first — the two schemas share enough
    // optional shape that both can `safeParse` the same payload without it.
    if (searchType === LINKEDIN_SEARCH_TYPE.COMPANY) {
      const parsed = LINKEDIN_BY_COMPANY_REQUEST_SCHEMA.safeParse(body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: "Request body is invalid",
          details: parsed.error.flatten(),
        });
        return;
      }

      const data = await fetchLinkedInByCompany(parsed.data);
      const response: ALApiResponse<LINKEDIN_BY_COMPANY_RESPONSE[]> = {
        success: true,
        data,
      };
      res.status(200).json(response);
      return;
    }

    if (searchType === LINKEDIN_SEARCH_TYPE.PEOPLE) {
      const parsed = LINKEDIN_BY_PEOPLE_REQUEST_SCHEMA.safeParse(body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: "Request body is invalid",
          details: parsed.error.flatten(),
        });
        return;
      }

      const data = await fetchLinkedInByPeople(parsed.data);
      const response: ALApiResponse<LINKEDIN_BY_PEOPLE_RESPONSE[]> = {
        success: true,
        data,
      };
      res.status(200).json(response);
      return;
    }

    res.status(400).json({
      success: false,
      error: `Missing or invalid searchType. Expected "${LINKEDIN_SEARCH_TYPE.PEOPLE}" or "${LINKEDIN_SEARCH_TYPE.COMPANY}".`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch LinkedIn data",
    });
  }
};
