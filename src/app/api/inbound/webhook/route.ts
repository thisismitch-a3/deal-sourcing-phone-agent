import type { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getWhisperContext, getAgentSettings } from '@/lib/kv';
import {
  buildWhisperPrompt,
  FALLBACK_WHISPER,
  INBOUND_FALLBACK_SYSTEM_PROMPT,
  DEFAULT_AGENT_SETTINGS,
} from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const payload = await request.json();
    const callerPhone: string | null =
      payload?.call?.customer?.number ?? payload?.customer?.number ?? null;

    const mitchPhone = process.env.MITCHEL_PHONE_NUMBER;
    const elevenLabsVoiceId = process.env.ELEVENLABS_VOICE_ID;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    const [ctx, storedSettings] = await Promise.all([
      callerPhone ? getWhisperContext(callerPhone).catch(() => null) : Promise.resolve(null),
      getAgentSettings().catch(() => null),
    ]);

    const settings = { ...DEFAULT_AGENT_SETTINGS, ...storedSettings };

    let whisperText = FALLBACK_WHISPER(callerPhone ?? 'unknown number');
    if (settings.whisperEnabled && ctx && anthropicKey) {
      try {
        const client = new Anthropic({ apiKey: anthropicKey });
        const msg = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 256,
          messages: [{ role: 'user', content: buildWhisperPrompt(ctx, settings.whisperStyle) }],
        });
        if (msg.content[0].type === 'text') {
          whisperText = msg.content[0].text.trim();
        }
      } catch {
        // Fall back to static whisper
      }
    }

    if (mitchPhone) {
      const transferPlan = settings.whisperEnabled
        ? {
            mode: 'warm-transfer-experimental',
            message: whisperText,
            fallbackPlan: {
              message: `I'm sorry, ${settings.agentName} is unavailable right now. Please leave your name, number, and a brief message after the tone and he'll get back to you shortly.`,
              endCallEnabled: false,
            },
          }
        : {
            mode: 'blind-transfer',
          };

      return Response.json({
        assistant: {
          firstMessage: 'Please hold for just one moment.',
          model: {
            provider: 'anthropic',
            model: 'claude-sonnet-4-20250514',
            messages: [
              {
                role: 'system',
                content:
                  'You are a call routing assistant. Your only job is to immediately transfer this call using the transferCall tool. Do not greet or ask questions — invoke the transfer right now.',
              },
            ],
          },
          voice: elevenLabsVoiceId
            ? { provider: '11labs', voiceId: elevenLabsVoiceId }
            : { provider: 'openai', voice: 'alloy' },
          maxDurationSeconds: 600,
          artifactPlan: { recordingEnabled: true },
          tools: [
            {
              type: 'transferCall',
              destinations: [
                {
                  type: 'number',
                  number: mitchPhone,
                  transferPlan,
                },
              ],
            },
          ],
        },
      });
    }

    return Response.json({
      assistant: {
        firstMessage: `Hi, you've reached ${settings.agentName} at AR Business Brokers. ${settings.agentName} is unavailable right now. Please leave your name, number, and a brief message and he'll get back to you shortly.`,
        model: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
          messages: [{ role: 'system', content: INBOUND_FALLBACK_SYSTEM_PROMPT }],
        },
        voice: elevenLabsVoiceId
          ? { provider: '11labs', voiceId: elevenLabsVoiceId }
          : { provider: 'openai', voice: 'alloy' },
        maxDurationSeconds: 300,
        artifactPlan: { recordingEnabled: true },
      },
    });
  } catch (err) {
    console.error('[inbound/webhook]', err);
    return Response.json({
      assistant: {
        firstMessage:
          "Hi, you've reached Mitchel Campbell at AR Business Brokers. Please leave a message after the tone.",
        model: { provider: 'openai', model: 'gpt-4o-mini' },
        voice: { provider: 'openai', voice: 'alloy' },
        maxDurationSeconds: 300,
        artifactPlan: { recordingEnabled: true },
      },
    });
  }
}
