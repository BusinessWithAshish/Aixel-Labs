import { Response } from "express";
import {
  StreamMessage,
  StreamMessageType,
  serializeStreamMessage,
  createStreamMessage,
} from "@aixellabs/shared/apis";

// Re-export types and utilities from shared package
export {
  StreamMessage,
  StreamMessageType,
  serializeStreamMessage,
  createStreamMessage,
};

// Helper to send streaming messages (Backend-specific with Express Response)
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

// Convenience functions for common message types
export const sendStatusMessage = (
  res: Response | null,
  message: string,
  data?: StreamMessage["data"]
): void => {
  sendStreamMessage(
    res,
    createStreamMessage(StreamMessageType.STATUS, message, data)
  );
};

export const sendProgressMessage = (
  res: Response | null,
  message: string,
  data?: StreamMessage["data"]
): void => {
  sendStreamMessage(
    res,
    createStreamMessage(StreamMessageType.PROGRESS, message, data)
  );
};

export const sendErrorMessage = (
  res: Response | null,
  message: string,
  data?: StreamMessage["data"]
): void => {
  sendStreamMessage(
    res,
    createStreamMessage(StreamMessageType.ERROR, message, data)
  );
};

export const sendCompleteMessage = (
  res: Response | null,
  message: string,
  data?: StreamMessage["data"]
): void => {
  sendStreamMessage(
    res,
    createStreamMessage(StreamMessageType.COMPLETE, message, data)
  );
};
