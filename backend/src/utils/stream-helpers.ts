import { Response } from "express";

// Stream message type enum
export enum StreamMessageType {
  PROGRESS = "progress",
  STATUS = "status",
  ERROR = "error",
  COMPLETE = "complete",
}

// Stream message structure
export type StreamMessage = {
  type: StreamMessageType;
  message: string;
  data?: {
    current?: number;
    total?: number;
    percentage?: number;
    stage?: string;
    batch?: number;
    browser?: number;
    [key: string]: unknown;
  };
  timestamp: string;
};

// Utility to serialize stream messages (includes SSE format with data: prefix and \n\n delimiter)
export const serializeStreamMessage = (message: StreamMessage): string => {
  return `data: ${JSON.stringify(message)}\n\n`;
};

// Helper to send streaming messages
export const sendStreamMessage = (
  res: Response | null,
  message: StreamMessage
): void => {
  if (res && !res.headersSent) {
    try {
      res.write(serializeStreamMessage(message));
    } catch (error) {
      console.warn("Failed to send stream message:", error);
    }
  }
  console.log(`📡 [${message.type.toUpperCase()}] ${message.message}`);
};

// Helper to create stream messages with automatic timestamp
export const createStreamMessage = (
  type: StreamMessageType,
  message: string,
  data?: StreamMessage["data"]
): StreamMessage => {
  return {
    type,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
};

// Convenience functions for common message types
export const sendStatusMessage = (
  res: Response | null,
  message: string,
  data?: StreamMessage["data"]
): void => {
  sendStreamMessage(res, createStreamMessage(StreamMessageType.STATUS, message, data));
};

export const sendProgressMessage = (
  res: Response | null,
  message: string,
  data?: StreamMessage["data"]
): void => {
  sendStreamMessage(res, createStreamMessage(StreamMessageType.PROGRESS, message, data));
};

export const sendErrorMessage = (
  res: Response | null,
  message: string,
  data?: StreamMessage["data"]
): void => {
  sendStreamMessage(res, createStreamMessage(StreamMessageType.ERROR, message, data));
};

export const sendCompleteMessage = (
  res: Response | null,
  message: string,
  data?: StreamMessage["data"]
): void => {
  sendStreamMessage(res, createStreamMessage(StreamMessageType.COMPLETE, message, data));
};
