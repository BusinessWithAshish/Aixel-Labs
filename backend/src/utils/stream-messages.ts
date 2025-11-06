import { Response } from "express";

/**
 * Base stream event types - applicable to any streaming operation
 */
export type BaseStreamEventType = 
  | 'status'      // General status updates
  | 'progress'    // Progress updates with percentage
  | 'error'       // Error notifications
  | 'complete'    // Operation completion
  | 'warning';    // Warning messages

/**
 * Extended stream event types - can be customized per API
 */
export type ExtendedStreamEventType = string;

/**
 * Combined stream event type
 */
export type StreamEventType = BaseStreamEventType | ExtendedStreamEventType;

/**
 * Base metadata that all stream messages can include
 */
export type BaseStreamMetadata = {
  current?: number;
  total?: number;
  percentage?: number;
  stage?: string;
  timestamp: string;
};

/**
 * Generic stream message structure
 * @template TEventType - The type of events (base or extended)
 * @template TMetadata - Custom metadata extending base metadata
 */
export type StreamMessage<
  TEventType extends StreamEventType = BaseStreamEventType,
  TMetadata extends Record<string, any> = Record<string, any>
> = {
  type: TEventType;
  message: string;
  data?: BaseStreamMetadata & TMetadata;
};

/**
 * Stream sender function type
 */
export type StreamSender<
  TEventType extends StreamEventType = BaseStreamEventType,
  TMetadata extends Record<string, any> = Record<string, any>
> = (message: StreamMessage<TEventType, TMetadata>) => void;

/**
 * Creates a stream sender function for a given response object
 * @param res - Express Response object (can be null for no streaming)
 * @param options - Configuration options
 * @returns A function to send stream messages
 */
export const createStreamSender = <
  TEventType extends StreamEventType = BaseStreamEventType,
  TMetadata extends Record<string, any> = Record<string, any>
>(
  res: Response | null,
  options?: {
    enableConsoleLog?: boolean;
    logPrefix?: string;
    autoTimestamp?: boolean;
  }
): StreamSender<TEventType, TMetadata> => {
  const {
    enableConsoleLog = true,
    logPrefix = '📡',
    autoTimestamp = true
  } = options || {};

  return (message: StreamMessage<TEventType, TMetadata>) => {
    // Auto-add timestamp if enabled and not present
    const finalMessage = autoTimestamp && message.data
      ? {
          ...message,
          data: {
            ...message.data,
            timestamp: message.data.timestamp || new Date().toISOString()
          }
        }
      : message;

    // Send to SSE stream if response exists
    if (res && !res.headersSent && !res.writableEnded) {
      try {
        res.write(`data: ${JSON.stringify(finalMessage)}\n\n`);
      } catch (error) {
        console.warn('⚠️ Failed to send stream message:', error);
      }
    }

    // Log to console if enabled
    if (enableConsoleLog) {
      console.log(`${logPrefix} [${finalMessage.type.toUpperCase()}] ${finalMessage.message}`);
    }
  };
};

/**
 * Helper to initialize SSE response headers
 */
export const initializeSSEResponse = (res: Response): void => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });
};

/**
 * Helper to create a typed stream message
 */
export const createStreamMessage = <
  TEventType extends StreamEventType = BaseStreamEventType,
  TMetadata extends Record<string, any> = Record<string, any>
>(
  type: TEventType,
  message: string,
  data?: BaseStreamMetadata & TMetadata
): StreamMessage<TEventType, TMetadata> => {
  return {
    type,
    message,
    data: data ? {
      ...data,
      timestamp: data.timestamp || new Date().toISOString()
    } : { timestamp: new Date().toISOString() } as any
  };
};

/**
 * Predefined stream event types for browser operations
 */
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

/**
 * Metadata specific to browser operations
 */
export type BrowserStreamMetadata = {
  browser?: number;
  batch?: number;
  page?: number;
  url?: string;
};

/**
 * Browser-specific stream message type
 */
export type BrowserStreamMessage = StreamMessage<BrowserStreamEventType, BrowserStreamMetadata>;

/**
 * Browser-specific stream sender
 */
export type BrowserStreamSender = StreamSender<BrowserStreamEventType, BrowserStreamMetadata>;
