import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/fal/upload/initiate
 *
 * Gets a presigned upload URL from fal.ai CDN.
 * The client then PUTs the file directly to fal CDN — no double transfer.
 * Body: { contentType: string, fileName: string }
 * Returns: { upload_url: string, file_url: string }
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'FAL_KEY not configured' }, { status: 500 });
  }

  try {
    const { contentType, fileName } = await req.json();

    const res = await fetch(
      'https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3',
      {
        method: 'POST',
        headers: {
          Authorization: `Key ${apiKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content_type: contentType || 'application/octet-stream',
          file_name: fileName || 'file',
        }),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error('[upload/initiate] fal error:', res.status, text);
      return NextResponse.json({ error: `fal error: ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[upload/initiate] error:', err);
    return NextResponse.json(
      { error: `Initiate error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
