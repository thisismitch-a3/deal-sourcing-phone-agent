import type { NextRequest } from 'next/server';
import { getWhisperContext, saveVoicemail } from '@/lib/kv';
import { generateId } from '@/lib/utils';
import type { Voicemail } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Vapi fires this endpoint at the end of every inbound call (end-of-call webhook).
// We save the recording + transcript as a voicemail entry in KV.
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const payload = await request.json();

    const call = payload?.call ?? payload;
    const callerPhone: string | null =
      call?.customer?.number ?? null;

    // Look up restaurant context for this phone number
    const ctx = callerPhone
      ? await getWhisperContext(callerPhone).catch(() => null)
      : null;

    // Extract transcript text
    let transcript: string | null = null;
    if (call?.transcript) {
      transcript =
        typeof call.transcript === 'string'
          ? call.transcript
          : (call.transcript as Array<{ role: string; content: string }>)
              .map((t) => `${t.role}: ${t.content}`)
              .join('\n');
    }

    const voicemail: Voicemail = {
      id: generateId(),
      restaurantPhone: callerPhone ?? 'unknown',
      restaurantName: ctx?.restaurantName ?? null,
      restaurantId: ctx?.restaurantId ?? null,
      callId: call?.id ?? generateId(),
      recordingUrl: call?.recordingUrl ?? null,
      transcript,
      receivedAt: new Date().toISOString(),
      reviewed: false,
    };

    await saveVoicemail(voicemail);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[inbound/voicemail]', err);
    // Return 200 so Vapi doesn't retry — we don't want to block the call
    return Response.json({ ok: false, error: 'Failed to save voicemail.' });
  }
}
