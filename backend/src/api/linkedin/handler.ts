import { ALApiResponse } from "../types";
import { fetchLinkedInByCompany } from "./helpers";
import { Request, Response } from "express";
import {
  LINKEDIN_BY_COMPANY_REQUEST_SCHEMA,
  LINKEDIN_BY_PEOPLE_REQUEST_SCHEMA,
} from "./schemas";
import { LINKEDIN_BY_COMPANY_RESPONSE } from "./types";

export const linkedinApiHandler = async (req: Request, res: Response) => {
  try {
    const { body } = req;

    const parsedLinkedinByPeopleBody =
      LINKEDIN_BY_PEOPLE_REQUEST_SCHEMA.safeParse(body);
    const parsedLinkedinByCompanyBody =
      LINKEDIN_BY_COMPANY_REQUEST_SCHEMA.safeParse(body);

    if (
      !parsedLinkedinByPeopleBody.success &&
      !parsedLinkedinByCompanyBody.success
    ) {
      res
        .status(400)
        .json({ success: false, error: "Request body is invalid" });
      return;
    }

    if (
      parsedLinkedinByCompanyBody.success &&
      parsedLinkedinByPeopleBody.success
    ) {
      res.status(400).json({
        success: false,
        error: "Only one of the search types is allowed",
      });
      return;
    }

    if (parsedLinkedinByCompanyBody.success) {
      const data = await fetchLinkedInByCompany(
        parsedLinkedinByCompanyBody.data,
      );

      const response: ALApiResponse<LINKEDIN_BY_COMPANY_RESPONSE[]> = {
        success: true,
        data,
      };

      res.status(200).json(response);
      return;
    }

    if (parsedLinkedinByPeopleBody.success) {
      res.status(501).json({
        success: false,
        error: "This API is not implemented yet",
      });
      return;
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch LinkedIn data" });
    return;
  }
};
