import { Response } from "express";
import {
  type StreamMessage,
  StreamMessageType,
  serializeStreamMessage,
  createStreamMessage,
} from "@aixellabs/shared/common/apis";

// Re-export types and utilities from a shared package
export type { StreamMessage };
export { StreamMessageType, serializeStreamMessage, createStreamMessage };

// Helper to send streaming messages (Backend-specific with Express Response)
export const sendStreamMessage = (
  res: Response | null,
  message: StreamMessage
): void => {
  if (!res) {
    console.log(
      `📡 [${message.type.toUpperCase()}] ${
        message.message
      } (no response object)`
    );
    return;
  }

  // Check if response is still writable
  if (res.writableEnded || res.writableFinished) {
    console.warn(
      `⚠️ Response already ended, cannot send: [${message.type.toUpperCase()}] ${
        message.message
      }`
    );
    return;
  }

  try {
    const serialized = serializeStreamMessage(message);
    const written = res.write(serialized);

    if (!written) {
      console.warn("⚠️ Write buffer full, message queued");
    }

    // Flush the response to ensure immediate delivery
    // This is critical for SSE to work properly
    if (typeof (res as any).flush === "function") {
      (res as any).flush();
    }

    console.log(`✅ Sent: [${message.type.toUpperCase()}] ${message.message}`);
  } catch (error) {
    console.error(`❌ Failed to send stream message:`, error);
  }
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
