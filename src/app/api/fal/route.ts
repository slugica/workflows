import { NextRequest, NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

/**
 * POST /api/fal
 *
 * Proxies requests to fal.ai API using the official SDK.
 * Body: { modelId: string, input: Record<string, unknown> }
 */

export async function POST(req: NextRequest) {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'FAL_KEY not configured. Add it to .env.local' },
      { status: 500 }
    );
  }

  fal.config({ credentials: apiKey });

  let body: { modelId: string; input: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { modelId, input } = body;
  if (!modelId) {
    return NextResponse.json({ error: 'modelId is required' }, { status: 400 });
  }

  try {
    // Use fal.subscribe which handles queue + polling automatically
    const result = await fal.subscribe(modelId, { input });

    return NextResponse.json({ result: result.data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('FAL ERROR:', message);
    return NextResponse.json(
      { error: `fal.ai error: ${message}` },
      { status: 500 }
    );
  }
}
