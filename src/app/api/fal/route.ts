import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/fal
 *
 * Proxies requests to fal.ai API.
 * Body: { modelId: string, input: Record<string, unknown> }
 *
 * Uses FAL_KEY from environment. Supports both sync and queue modes.
 * For long-running models (video), uses queue with polling.
 */

const FAL_API = 'https://queue.fal.run';
const POLL_INTERVAL = 2000; // ms
const MAX_POLL_TIME = 300_000; // 5 min

export async function POST(req: NextRequest) {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'FAL_KEY not configured. Add it to .env.local' },
      { status: 500 }
    );
  }

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
    // Submit to queue
    const submitRes = await fetch(`${FAL_API}/${modelId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text();
      return NextResponse.json(
        { error: `fal.ai error (${submitRes.status}): ${errText}` },
        { status: submitRes.status }
      );
    }

    const submitData = await submitRes.json();

    // If we got a direct result (no request_id), return it
    if (!submitData.request_id) {
      return NextResponse.json({ result: submitData });
    }

    // Poll for result
    const requestId = submitData.request_id;
    const statusUrl = `https://queue.fal.run/${modelId}/requests/${requestId}/status`;
    const resultUrl = `https://queue.fal.run/${modelId}/requests/${requestId}`;
    const startTime = Date.now();

    while (Date.now() - startTime < MAX_POLL_TIME) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));

      const statusRes = await fetch(statusUrl, {
        headers: { 'Authorization': `Key ${apiKey}` },
      });

      if (!statusRes.ok) {
        const errText = await statusRes.text();
        return NextResponse.json(
          { error: `fal.ai status check failed: ${errText}` },
          { status: 500 }
        );
      }

      const statusData = await statusRes.json();

      if (statusData.status === 'COMPLETED') {
        // Fetch the result
        const resultRes = await fetch(resultUrl, {
          headers: { 'Authorization': `Key ${apiKey}` },
        });
        if (!resultRes.ok) {
          const errText = await resultRes.text();
          return NextResponse.json(
            { error: `fal.ai result fetch failed: ${errText}` },
            { status: 500 }
          );
        }
        const resultData = await resultRes.json();
        return NextResponse.json({ result: resultData });
      }

      if (statusData.status === 'FAILED') {
        return NextResponse.json(
          { error: `fal.ai generation failed: ${statusData.error || 'Unknown error'}` },
          { status: 500 }
        );
      }

      // IN_QUEUE or IN_PROGRESS — keep polling
    }

    return NextResponse.json(
      { error: 'Generation timed out (5 min)' },
      { status: 504 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: `Request failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
