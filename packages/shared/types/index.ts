// Export types
export interface User {
  id: string;
  email: string;
  name?: string;
}

export type ApiResponse<T> = {
  success: boolean;
  data: T;
}

