import { NextRequest, NextResponse } from 'next/server';
import { checkConnection } from '@/lib/mongodb';

/**
 * Health check endpoint for MongoDB connection
 * GET /api/health
 */
export async function GET(request: NextRequest) {
  try {
    const isConnected = await checkConnection();

    if (isConnected) {
      return NextResponse.json(
        {
          success: true,
          message: 'MongoDB connection is healthy',
          timestamp: new Date().toISOString(),
        },
        { status: 200 }
      );
    } else {
      return NextResponse.json(
        {
          success: false,
          error: '[ NON-CRITICAL ] MongoDB connection failed',
          timestamp: new Date().toISOString(),
        },
        { status: 503 }
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        success: false,
        error: '[ CRITICAL ] Failed to check MongoDB connection',
        message: errorMessage,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
