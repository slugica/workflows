import { NextResponse } from 'next/server';

const TUNETANK_BASE = 'https://api.tunetank.com/v1/models';

export async function GET() {
  const token = process.env.TUNETANK_TOKEN;
  console.log('[/api/models] TUNETANK_TOKEN present:', !!token, 'length:', token?.length);

  if (!token) {
    return NextResponse.json(
      { error: 'TUNETANK_TOKEN not configured in .env.local' },
      { status: 500 }
    );
  }

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
  };

  try {
    console.log('[/api/models] Fetching:', `${TUNETANK_BASE}/image`);
    const [imageRes, videoRes] = await Promise.all([
      fetch(`${TUNETANK_BASE}/image`, { headers, cache: 'no-store' }),
      fetch(`${TUNETANK_BASE}/video`, { headers, cache: 'no-store' }),
    ]);

    console.log('[/api/models] image status:', imageRes.status, 'video status:', videoRes.status);

    if (!imageRes.ok || !videoRes.ok) {
      const errText = !imageRes.ok
        ? await imageRes.text()
        : await videoRes.text();
      console.error('[/api/models] Upstream error:', errText);
      return NextResponse.json(
        { error: `Upstream: ${errText}` },
        { status: 502 }
      );
    }

    const [imageModels, videoModels] = await Promise.all([
      imageRes.json(),
      videoRes.json(),
    ]);

    console.log('[/api/models] OK — image:', imageModels.length, 'video:', videoModels.length);
    return NextResponse.json({ image: imageModels, video: videoModels });
  } catch (err) {
    console.error('[/api/models] Exception:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
