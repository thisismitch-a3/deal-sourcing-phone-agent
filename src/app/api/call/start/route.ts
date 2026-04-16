import type { NextRequest } from 'next/server';
import { VapiClient } from '@vapi-ai/server-sdk';
import { saveWhisperContext, getAgentSettings } from '@/lib/kv';
import { buildDealSourcingSystemPrompt, buildVoicemailScript, DEFAULT_AGENT_SETTINGS } from '@/lib/utils';
import type { CallStartRequest, CallStartResponse } from '@/lib/types';

function hasSingleCallId(r: unknown): r is { id: string } {
  return typeof r === 'object' && r !== null && 'id' in r && typeof (r as { id: unknown }).id === 'string';
}

function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('+')) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
  return trimmed;
}

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body: CallStartRequest = await request.json();

    if (!body.phone || !body.companyName) {
      return Response.json(
        { error: 'Missing required fields: phone and companyName.' } satisfies CallStartResponse,
        { status: 400 }
      );
    }

    const vapiKey = process.env.VAPI_API_KEY;
    const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
    const elevenLabsVoiceId = process.env.ELEVENLABS_VOICE_ID;
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;

    if (!vapiKey || !phoneNumberId || !elevenLabsVoiceId) {
      return Response.json(
        { error: 'Server configuration incomplete. Check VAPI_API_KEY, VAPI_PHONE_NUMBER_ID, and ELEVENLABS_VOICE_ID.' } satisfies CallStartResponse,
        { status: 500 }
      );
    }

    const normalizedPhone = normalizePhone(body.phone);

    const storedSettings = await getAgentSettings().catch(() => null);
    const settings = { ...DEFAULT_AGENT_SETTINGS, ...storedSettings };

    console.log(`[call/start] phoneNumberId=${phoneNumberId} → calling ${normalizedPhone} for "${body.companyName}" (contact: ${body.contactName})`);

    const vapi = new VapiClient({ token: vapiKey });

    const systemPrompt = buildDealSourcingSystemPrompt({
      companyName: body.companyName,
      contactName: body.contactName,
      city: body.city,
      industry: body.industry,
      description: body.description,
      researchNotes: body.researchNotes,
      talkingPoints: body.talkingPoints,
      settings,
    });

    // Build the voicemail message so Vapi speaks it when AMD detects voicemail
    const voicemailMessage = settings.voicemailEnabled
      ? buildVoicemailScript({
          contactName: body.contactName,
          industry: body.industry,
          settings,
        })
      : undefined;

    const callResponse = await vapi.calls.create({
      phoneNumberId,
      customer: { number: normalizedPhone },
      assistant: {
        // assistant-waits-for-user: no firstMessage needed, agent waits for the person to say hello
        firstMessageMode: settings.firstMessageMode === 'assistant-speaks-first'
          ? 'assistant-speaks-first'
          : 'assistant-waits-for-user',
        model: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
          temperature: 0.3,
          maxTokens: 300,
          messages: [{ role: 'system', content: systemPrompt }],
          tools: [{ type: 'dtmf' }],
        },
        voice: {
          provider: '11labs',
          voiceId: elevenLabsVoiceId,
          model: settings.elevenLabsModel || 'eleven_turbo_v2_5',
          useSpeakerBoost: settings.useSpeakerBoost ?? true,
          stability: Math.min(Math.max(settings.voiceStability, 0), 1),
          similarityBoost: Math.min(Math.max(settings.voiceSimilarityBoost, 0), 1),
          speed: Math.min(Math.max(settings.voiceSpeed, 0.5), 1.2),
        },
        backgroundSound: settings.backgroundSound || 'off',
        voicemailDetection: {
          provider: 'twilio' as const,
          enabled: true,
        },
        ...(voicemailMessage ? { voicemailMessage } : {}),
        startSpeakingPlan: {
          waitSeconds: 1.5,
          smartEndpointingEnabled: true,
        },
        stopSpeakingPlan: {
          numWords: 0,
          voiceSeconds: 0.2,
          backoffSeconds: 1,
        },
        artifactPlan: { recordingEnabled: true },
        maxDurationSeconds: settings.maxCallDurationSeconds,
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

    const call = callResponse as { id: string };

    // Save whisper context for inbound callbacks
    try {
      await saveWhisperContext(normalizedPhone, {
        businessId: body.businessId,
        companyName: body.companyName,
        contactName: body.contactName,
        city: body.city,
        industry: body.industry,
        callOutcome: '',
        outboundCallId: call.id,
        savedAt: new Date().toISOString(),
      });
    } catch {
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
