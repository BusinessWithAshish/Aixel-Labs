import type { Request, Response } from "express";
import { ALApiResponse } from "../types";

export const homeHandler = async (req: Request, res: Response) => {
  const response: ALApiResponse<{ message: string }> = {
    success: true,
    data: {
      message: "Aixel Labs API is running",
    },
  };
  res.json(response);
};
