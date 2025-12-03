import { NextRequest, NextResponse } from 'next/server';
import { getCollection, MongoObjectId } from '@aixellabs/shared/mongodb';

/**
 * Example API route demonstrating MongoDB CRUD operations
 * This is a template - modify according to your needs
 */

// GET - Fetch documents from collection
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '10');
    const skip = parseInt(searchParams.get('skip') || '0');

    // Replace 'your_collection' with your actual collection name
    const collection = await getCollection('tenants');

    
    const documents = await collection
      .find({})
      .limit(limit)
      .skip(skip)
      .toArray();

    const total = await collection.countDocuments();

    return NextResponse.json(
      {
        success: true,
        data: documents,
        pagination: {
          total,
          limit,
          skip,
          hasMore: skip + limit < total,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch documents',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}

// POST - Create new document
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;

    // Replace 'your_collection' with your actual collection name
    const collection = await getCollection('tenants');
    
    const result = await collection.insertOne({
      ...body,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: result.insertedId,
          ...body,
        },
        message: 'Document created successfully',
      },
      { status: 201 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create document',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}

// PUT - Update document (full replacement)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json() as { id?: string } & Record<string, unknown>;
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Document ID is required',
        },
        { status: 400 }
      );
    }

    // Replace 'your_collection' with your actual collection name
    const collection = await getCollection('tenants');
    
    const result = await collection.updateOne(
      { _id: new MongoObjectId(id) },
      {
        $set: {
          ...updateData,
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Document not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: { id, ...updateData },
        message: 'Document updated successfully',
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update document',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}

// PATCH - Partial update document
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as { id?: string } & Record<string, unknown>;
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Document ID is required',
        },
        { status: 400 }
      );
    }

    // Replace 'your_collection' with your actual collection name
    const collection = await getCollection('tenants');
    
    const result = await collection.updateOne(
      { _id: new MongoObjectId(id) },
      {
        $set: {
          ...updateData,
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Document not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Document partially updated successfully',
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to patch document',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}

// DELETE - Delete document
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Document ID is required',
        },
        { status: 400 }
      );
    }

    // Replace 'your_collection' with your actual collection name
    const collection = await getCollection('tenants');
    
    const result = await collection.deleteOne({ _id: new MongoObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Document not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Document deleted successfully',
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete document',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
