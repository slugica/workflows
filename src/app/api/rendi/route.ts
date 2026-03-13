import { NextRequest, NextResponse } from 'next/server';

const RENDI_BASE = 'https://api.rendi.dev/v1';

/**
 * POST /api/rendi
 *
 * Sends an ffmpeg command to Rendi, polls until done, returns result.
 * Body: {
 *   input_files: { in_video: "https://..." },
 *   output_files: { out_video: "output.mp4" },
 *   ffmpeg_command: "-i {{in_video}} -vf crop=640:480:0:0 {{out_video}}"
 * }
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.RENDI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'RENDI_API_KEY not configured. Add it to .env.local' },
      { status: 500 }
    );
  }

  let body: {
    input_files: Record<string, string>;
    output_files: Record<string, string>;
    ffmpeg_command: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { input_files, output_files, ffmpeg_command } = body;
  if (!input_files || !output_files || !ffmpeg_command) {
    return NextResponse.json(
      { error: 'input_files, output_files, and ffmpeg_command are required' },
      { status: 400 }
    );
  }

  try {
    // 1. Submit command
    const submitRes = await fetch(`${RENDI_BASE}/run-ffmpeg-command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify({ input_files, output_files, ffmpeg_command }),
    });

    if (!submitRes.ok) {
      const err = await submitRes.text();
      return NextResponse.json(
        { error: `Rendi submit error: ${submitRes.status} ${err}` },
        { status: 500 }
      );
    }

    const { command_id } = await submitRes.json();
    if (!command_id) {
      return NextResponse.json({ error: 'No command_id returned' }, { status: 500 });
    }

    // 2. Poll until done (max 5 minutes)
    const maxWait = 5 * 60 * 1000;
    const start = Date.now();
    let pollInterval = 1000;

    while (Date.now() - start < maxWait) {
      await new Promise((r) => setTimeout(r, pollInterval));
      // Gradually increase poll interval: 1s, 2s, 3s, max 5s
      pollInterval = Math.min(pollInterval + 1000, 5000);

      const pollRes = await fetch(`${RENDI_BASE}/commands/${command_id}`, {
        headers: { 'X-API-KEY': apiKey },
      });

      if (!pollRes.ok) continue;

      const pollData = await pollRes.json();
      const status = pollData.status;

      if (status === 'SUCCESS') {
        return NextResponse.json({
          success: true,
          command_id,
          output_files: pollData.output_files,
          processing_seconds: pollData.total_processing_seconds,
        });
      }

      if (status === 'FAILED') {
        console.error('[RENDI] Failed:', JSON.stringify(pollData, null, 2));
        return NextResponse.json(
          { error: `FFmpeg command failed: ${pollData.error_message || pollData.error || 'Unknown error'}` },
          { status: 500 }
        );
      }

      // PENDING or PROCESSING — keep polling
    }

    return NextResponse.json(
      { error: 'Processing timed out after 5 minutes' },
      { status: 504 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('RENDI ERROR:', message);
    return NextResponse.json({ error: `Rendi error: ${message}` }, { status: 500 });
  }
}
