import { NextRequest, NextResponse } from 'next/server';

const TUNETANK_BASE = 'https://api.tunetank.com/v1';

async function safeParseResponse(res: Response): Promise<{ ok: boolean; status: number; data: unknown; text: string }> {
  const text = await res.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = null; }
  return { ok: res.ok, status: res.status, data, text };
}

/**
 * POST /api/generate
 * Body: { modelId: string, type: 'image' | 'video', payload: Record<string, unknown> }
 * Returns: { result: [{ txId }], credits }
 */
export async function POST(req: NextRequest) {
  const token = process.env.TUNETANK_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'TUNETANK_TOKEN not configured' }, { status: 500 });
  }

  let body: { model: string; type: 'image' | 'video'; payload: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { model, type, payload } = body;
  if (!model || !type) {
    return NextResponse.json({ error: 'model and type are required' }, { status: 400 });
  }

  const requestBody = { model, ...payload };

  const endpoint = type === 'video'
    ? `${TUNETANK_BASE}/video/generate`
    : `${TUNETANK_BASE}/images/generate`;

  try {
    console.log(`[generate] POST ${endpoint} | model: ${model}`);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });

    const { ok, status, data, text } = await safeParseResponse(res);
    console.log(`[generate] response: ${status} — ${text.slice(0, 300)}`);

    if (!ok) {
      const errMsg = data && typeof data === 'object'
        ? ((data as Record<string, unknown>).message || (data as Record<string, unknown>).error || text) as string
        : text || `HTTP ${status}`;
      return NextResponse.json({ error: errMsg }, { status });
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[generate] exception:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/generate?txId=xxx&type=image|video
 * Poll status. Returns: { success, fileUrl, ... }
 */
export async function GET(req: NextRequest) {
  const token = process.env.TUNETANK_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'TUNETANK_TOKEN not configured' }, { status: 500 });
  }

  const txId = req.nextUrl.searchParams.get('txId');
  const type = req.nextUrl.searchParams.get('type') || 'image';

  if (!txId) {
    return NextResponse.json({ error: 'txId is required' }, { status: 400 });
  }

  const endpoint = type === 'video'
    ? `${TUNETANK_BASE}/video/status/${txId}`
    : `${TUNETANK_BASE}/images/status/${txId}`;

  try {
    const res = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    const { ok, status, data, text } = await safeParseResponse(res);

    if (!ok) {
      const errMsg = data && typeof data === 'object'
        ? ((data as Record<string, unknown>).message || (data as Record<string, unknown>).error || text) as string
        : text || `HTTP ${status}`;
      return NextResponse.json({ error: errMsg }, { status });
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
