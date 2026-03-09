import { NextRequest, NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

/**
 * POST /api/fal/upload
 *
 * Uploads a file to fal.ai storage via their official SDK.
 * Returns the public URL that fal.ai models can access.
 */

export async function POST(req: NextRequest) {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'FAL_KEY not configured' },
      { status: 500 }
    );
  }

  fal.config({ credentials: apiKey });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Upload via fal SDK
    const url = await fal.storage.upload(file);

    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json(
      { error: `Upload error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
