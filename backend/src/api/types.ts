export type ALApiResponse<T> = {
  success: boolean;
  error?: string;
  data?: T;
};
