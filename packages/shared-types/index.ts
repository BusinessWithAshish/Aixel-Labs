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

// Stream message types for SSE
export type BaseStreamEventType = 
  | 'status'
  | 'progress'
  | 'error'
  | 'complete'
  | 'warning';

export type BaseStreamMetadata = {
  current?: number;
  total?: number;
  percentage?: number;
  stage?: string;
  timestamp: string;
};

export type StreamMessage<
  TEventType extends string = BaseStreamEventType,
  TMetadata extends Record<string, any> = Record<string, any>
> = {
  type: TEventType;
  message: string;
  data?: BaseStreamMetadata & TMetadata;
};

// Browser-specific stream types
export type BrowserStreamEventType = 
  | BaseStreamEventType
  | 'browser_start'
  | 'browser_complete'
  | 'browser_cleanup'
  | 'page_start'
  | 'page_complete'
  | 'page_error'
  | 'batch_start'
  | 'batch_complete'
  | 'batch_delay';

export type BrowserStreamMetadata = {
  browser?: number;
  batch?: number;
  page?: number;
  url?: string;
};

export type BrowserStreamMessage = StreamMessage<BrowserStreamEventType, BrowserStreamMetadata>;

// Export all utilities
export * from './utils';