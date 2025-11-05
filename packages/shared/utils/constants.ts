// API Constants
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/api/auth/login',
    LOGOUT: '/api/auth/logout',
    REGISTER: '/api/auth/register',
    REFRESH: '/api/auth/refresh',
  },
  USER: {
    PROFILE: '/api/user/profile',
    UPDATE: '/api/user/update',
    DELETE: '/api/user/delete',
  },
  LEADS: {
    LIST: '/api/leads',
    CREATE: '/api/leads/create',
    UPDATE: '/api/leads/update',
    DELETE: '/api/leads/delete',
    SEARCH: '/api/leads/search',
  },
  MESSAGING: {
    SMS: '/api/messaging/sms',
    WHATSAPP: '/api/messaging/whatsapp',
    EMAIL: '/api/messaging/email',
  },
} as const;

// Environment Constants
export const ENV = {
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
  STAGING: 'staging',
  TEST: 'test',
} as const;

