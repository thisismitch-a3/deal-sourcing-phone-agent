import type { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getWhisperContext } from '@/lib/kv';
import {
  buildWhisperPrompt,
  FALLBACK_WHISPER,
  INBOUND_FALLBACK_SYSTEM_PROMPT,
} from '@/lib/utils';

export const dynamic = 'force-dynamic';

// Vapi calls this endpoint when the Vapi number receives an inbound call.
// We respond with an assistant config that:
//  1. Immediately tries a warm transfer to Mitch's phone with a whisper
//  2. Falls back to the AI voicemail agent if Mitch doesn't answer in 20s
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const payload = await request.json();
    const callerPhone: string | null =
      payload?.call?.customer?.number ?? payload?.customer?.number ?? null;

    const mitchPhone = process.env.MITCHEL_PHONE_NUMBER;
    const elevenLabsVoiceId = process.env.ELEVENLABS_VOICE_ID;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    // Look up restaurant context by caller phone number
    const ctx = callerPhone ? await getWhisperContext(callerPhone).catch(() => null) : null;

    // Generate whisper text via Claude
    let whisperText = FALLBACK_WHISPER(callerPhone ?? 'unknown number');
    if (ctx && anthropicKey) {
      try {
        const client = new Anthropic({ apiKey: anthropicKey });
        const msg = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 256,
          messages: [{ role: 'user', content: buildWhisperPrompt(ctx) }],
        });
        if (msg.content[0].type === 'text') {
          whisperText = msg.content[0].text.trim();
        }
      } catch {
        // Fall back to static whisper
      }
    }

    // Build the Vapi assistant response
    // Note: the exact transferPlan shape may need adjustment based on Vapi API version.
    // Refer to https://docs.vapi.ai for current warm-transfer / whisper configuration.
    const assistantConfig = {
      firstMessage: 'Please hold for just one moment.',
      model: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'system', content: INBOUND_FALLBACK_SYSTEM_PROMPT }],
      },
      voice: elevenLabsVoiceId
        ? { provider: '11labs' as const, voiceId: elevenLabsVoiceId }
        : { provider: 'openai' as const, voice: 'alloy' as const },
      maxDurationSeconds: 600,
      recordingEnabled: true,
      // Warm transfer with whisper — Mitch hears the whisper, the restaurant does not.
      // If Mitch doesn't answer within 20s, the fallback AI agent takes over.
      ...(mitchPhone
        ? {
            transferPlan: {
              mode: 'warm-transfer-say-message',
              message: whisperText,
              phoneNumber: mitchPhone,
              timeout: 20,
            },
          }
        : {}),
    };

    return Response.json({ assistant: assistantConfig });
  } catch (err) {
    console.error('[inbound/webhook]', err);
    // Return a minimal fallback assistant so the call still connects
    return Response.json({
      assistant: {
        firstMessage: "Hi, you've reached Mitchel Campbell's restaurant inquiry line. Please leave a message after the tone.",
        model: { provider: 'openai', model: 'gpt-4o-mini' },
        voice: { provider: 'openai', voice: 'alloy' },
        maxDurationSeconds: 300,
        recordingEnabled: true,
      },
    });
  }
}
