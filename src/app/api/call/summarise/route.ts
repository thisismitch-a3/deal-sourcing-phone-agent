import type { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { updateWhisperMenuOptions } from '@/lib/kv';
import type { SummariseRequest, SummariseResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body: SummariseRequest = await request.json();

    if (!body.transcript) {
      return Response.json(
        { safeMenuOptions: [], error: 'No transcript provided.' } satisfies SummariseResponse
      );
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return Response.json(
        { safeMenuOptions: [], error: 'ANTHROPIC_API_KEY is not configured.' } satisfies SummariseResponse,
        { status: 500 }
      );
    }

    const client = new Anthropic({ apiKey: anthropicKey });

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `You are extracting safe menu options from a restaurant phone call transcript.

Restaurant: ${body.restaurantName}
Dietary restrictions: ${body.dietaryRestrictions} (cross-contamination is fine — the person just cannot eat these ingredients directly)

Transcript:
${body.transcript}

List every dish or menu option that was mentioned as safe, suitable, or recommended for these restrictions. Return ONLY a valid JSON array of short strings — no explanation, no markdown, no wrapping text.

If no safe options were mentioned or confirmed, return an empty array.

Examples of valid output:
["Grilled salmon", "Caesar salad without croutons", "Ribeye steak with roasted vegetables"]
[]`,
        },
      ],
    });

    const raw =
      message.content[0].type === 'text' ? message.content[0].text.trim() : '[]';

    let safeMenuOptions: string[] = [];
    try {
      safeMenuOptions = JSON.parse(raw);
      if (!Array.isArray(safeMenuOptions)) safeMenuOptions = [];
    } catch {
      safeMenuOptions = [];
    }

    // Update whisper context so inbound callbacks have the latest menu options
    if (body.phone) {
      try {
        await updateWhisperMenuOptions(body.phone, safeMenuOptions);
      } catch {
        // Non-fatal
      }
    }

    return Response.json({ safeMenuOptions } satisfies SummariseResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Summarisation failed.';
    console.error('[call/summarise]', err);
    return Response.json(
      { safeMenuOptions: [], error: message } satisfies SummariseResponse,
      { status: 500 }
    );
  }
}
