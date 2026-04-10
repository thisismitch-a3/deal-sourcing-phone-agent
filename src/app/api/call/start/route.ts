import type { NextRequest } from 'next/server';
import { VapiClient } from '@vapi-ai/server-sdk';
import { saveWhisperContext, getAgentSettings } from '@/lib/kv';
import { buildFirstMessage, buildVapiSystemPromptFromSettings, DEFAULT_AGENT_SETTINGS } from '@/lib/utils';
import type { CallStartRequest, CallStartResponse } from '@/lib/types';

function hasSingleCallId(r: unknown): r is { id: string } {
  return typeof r === 'object' && r !== null && 'id' in r && typeof (r as { id: unknown }).id === 'string';
}

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body: CallStartRequest = await request.json();

    if (!body.phone || !body.restaurantName) {
      return Response.json(
        { error: 'Missing required fields: phone and restaurantName.' } satisfies CallStartResponse,
        { status: 400 }
      );
    }

    const vapiKey = process.env.VAPI_API_KEY;
    const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
    const elevenLabsVoiceId = process.env.ELEVENLABS_VOICE_ID;

    if (!vapiKey || !phoneNumberId || !elevenLabsVoiceId) {
      return Response.json(
        { error: 'Server configuration incomplete. Check VAPI_API_KEY, VAPI_PHONE_NUMBER_ID, and ELEVENLABS_VOICE_ID.' } satisfies CallStartResponse,
        { status: 500 }
      );
    }

    // Load agent settings from Redis (fall back to defaults if not configured)
    const storedSettings = await getAgentSettings().catch(() => null);
    const settings = { ...DEFAULT_AGENT_SETTINGS, ...storedSettings };

    const vapi = new VapiClient({ token: vapiKey });

    const systemPrompt = buildVapiSystemPromptFromSettings({
      restaurantName: body.restaurantName,
      dietaryRestrictions: body.dietaryRestrictions,
      specificDish: body.specificDish,
      settings,
    });

    const callResponse = await vapi.calls.create({
      phoneNumberId,
      customer: { number: body.phone },
      assistant: {
        firstMessage: buildFirstMessage(body.restaurantName, settings),
        model: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
          messages: [{ role: 'system', content: systemPrompt }],
        },
        voice: {
          provider: '11labs',
          voiceId: elevenLabsVoiceId,
        },
        maxDurationSeconds: settings.maxCallDurationSeconds,
        artifactPlan: { recordingEnabled: true },
      },
    });

    if (!hasSingleCallId(callResponse)) {
      return Response.json(
        { error: 'Unexpected batch response from Vapi. Use a single call.' } satisfies CallStartResponse,
        { status: 500 }
      );
    }

    // callResponse is narrowed to { id: string } — treat as a single Call
    const call = callResponse as { id: string };

    // Save whisper context so inbound callbacks can identify the restaurant
    try {
      await saveWhisperContext(body.phone, {
        restaurantId: body.restaurantId,
        restaurantName: body.restaurantName,
        address: body.address,
        neighborhood: body.address.split(',')[0].trim(),
        rating: body.rating,
        safeMenuOptions: [],
        dietaryRestrictions: body.dietaryRestrictions || settings.dietaryRestrictions,
        outboundCallId: call.id,
        savedAt: new Date().toISOString(),
      });
    } catch {
      // Non-fatal — whisper context save failure doesn't prevent the call
      console.warn('Failed to save whisper context for', body.phone);
    }

    return Response.json({ callId: call.id } satisfies CallStartResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start call.';
    console.error('[call/start]', err);
    return Response.json(
      { error: message } satisfies CallStartResponse,
      { status: 500 }
    );
  }
}
