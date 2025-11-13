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
          error: 'MongoDB connection failed',
          timestamp: new Date().toISOString(),
        },
        { status: 503 }
      );
    }
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to check MongoDB connection',
        message: error.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
