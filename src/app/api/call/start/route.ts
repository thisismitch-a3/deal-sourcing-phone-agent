import type { NextRequest } from 'next/server';
import { VapiClient } from '@vapi-ai/server-sdk';
import { saveWhisperContext, getAgentSettings } from '@/lib/kv';
import { buildFirstMessage, buildVapiSystemPromptFromSettings, DEFAULT_AGENT_SETTINGS } from '@/lib/utils';
import type { CallStartRequest, CallStartResponse } from '@/lib/types';

function hasSingleCallId(r: unknown): r is { id: string } {
  return typeof r === 'object' && r !== null && 'id' in r && typeof (r as { id: unknown }).id === 'string';
}

/**
 * Normalise a phone number to E.164 format, which Vapi requires.
 * Handles common North American inputs:
 *   4374943600       → +14374943600
 *   14374943600      → +14374943600
 *   (437) 494-3600   → +14374943600
 *   +14374943600     → +14374943600  (pass-through)
 */
function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('+')) return trimmed; // already E.164
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
  return trimmed; // unknown format — pass through, Vapi will return a clear error
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
    // Passed inline per-call so Vapi's dashboard credential storage is bypassed entirely.
    // This works around Vapi's dashboard rejecting newer ElevenLabs workspace key formats.
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;

    if (!vapiKey || !phoneNumberId || !elevenLabsVoiceId) {
      return Response.json(
        { error: 'Server configuration incomplete. Check VAPI_API_KEY, VAPI_PHONE_NUMBER_ID, and ELEVENLABS_VOICE_ID.' } satisfies CallStartResponse,
        { status: 500 }
      );
    }

    const normalizedPhone = normalizePhone(body.phone);

    // Load agent settings from Redis (fall back to defaults if not configured)
    const storedSettings = await getAgentSettings().catch(() => null);
    const settings = { ...DEFAULT_AGENT_SETTINGS, ...storedSettings };

    console.log(`[call/start] phoneNumberId=${phoneNumberId} → calling ${normalizedPhone} for "${body.restaurantName}" | elevenLabsVoiceId=${elevenLabsVoiceId}`);

    const vapi = new VapiClient({ token: vapiKey });

    const systemPrompt = buildVapiSystemPromptFromSettings({
      restaurantName: body.restaurantName,
      dietaryRestrictions: body.dietaryRestrictions,
      specificDish: body.specificDish,
      settings,
      approvedDishes: body.approvedDishes ?? [],
    });

    const callResponse = await vapi.calls.create({
      phoneNumberId,
      customer: { number: normalizedPhone },
      assistant: {
        firstMessage: buildFirstMessage(body.restaurantName, settings),
        model: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
          messages: [{ role: 'system', content: systemPrompt }],
          // DTMF tool lets the agent press keypad digits to navigate IVR menus
          tools: [{ type: 'dtmf' }],
        },
        voice: {
          provider: '11labs',
          voiceId: elevenLabsVoiceId,
          model: settings.elevenLabsModel || 'eleven_turbo_v2_5',
          useSpeakerBoost: settings.useSpeakerBoost ?? true,
          optimizeStreamingLatency: Math.min(Math.max(settings.optimizeStreamingLatency ?? 2, 2), 4),
          // Vapi enforces: stability 0–1, similarityBoost 0–1, speed 0.5–1.2, style 0–1
          stability: Math.min(Math.max(settings.voiceStability, 0), 1),
          similarityBoost: Math.min(Math.max(settings.voiceSimilarityBoost, 0), 1),
          speed: Math.min(Math.max(settings.voiceSpeed, 0.5), 1.2),
          style: Math.min(Math.max(settings.voiceStyle, 0), 1),
        },
        backgroundSound: 'off',
        backgroundSpeechDenoisingPlan: {
          smartDenoisingPlan: { enabled: settings.backgroundDenoisingEnabled ?? true },
        },
        maxDurationSeconds: settings.maxCallDurationSeconds,
        artifactPlan: { recordingEnabled: true },
        // Pass ElevenLabs API key inline to bypass Vapi's dashboard credential
        // storage, which rejects newer ElevenLabs workspace key formats.
        ...(elevenLabsApiKey && {
          credentials: [{ provider: '11labs', apiKey: elevenLabsApiKey }],
        }),
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
      await saveWhisperContext(normalizedPhone, {
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
      console.warn('Failed to save whisper context for', normalizedPhone);
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
