import { NextRequest, NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

/**
 * POST /api/fal/upload
 *
 * Proxy upload for small files (canvas blobs, processed images).
 * For large user files, use /api/fal/upload/initiate + direct PUT instead.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'FAL_KEY not configured' }, { status: 500 });
  }

  fal.config({ credentials: apiKey });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const url = await fal.storage.upload(file);
    if (!url) {
      return NextResponse.json({ error: 'Upload returned empty URL' }, { status: 500 });
    }

    return NextResponse.json({ url });
  } catch (err) {
    console.error('[upload] error:', err);
    return NextResponse.json(
      { error: `Upload error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
