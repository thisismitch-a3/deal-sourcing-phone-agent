import type { NextRequest } from 'next/server';
import { getWhisperContext, saveVoicemail } from '@/lib/kv';
import { generateId } from '@/lib/utils';
import type { Voicemail } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const payload = await request.json();

    const call = payload?.call ?? payload;
    const callerPhone: string | null =
      call?.customer?.number ?? null;

    const ctx = callerPhone
      ? await getWhisperContext(callerPhone).catch(() => null)
      : null;

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
      businessPhone: callerPhone ?? 'unknown',
      businessName: ctx?.companyName ?? null,
      businessId: ctx?.businessId ?? null,
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
    return Response.json({ ok: false, error: 'Failed to save voicemail.' });
  }
}
