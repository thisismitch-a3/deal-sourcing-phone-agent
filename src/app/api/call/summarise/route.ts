import type { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { updateWhisperOutcome } from '@/lib/kv';
import type { AnalyseCallRequest, AnalyseCallResponse, CallOutcome } from '@/lib/types';

export const dynamic = 'force-dynamic';

const VALID_OUTCOMES: Set<string> = new Set([
  'interested', 'maybe', 'not-interested', 'wrong-contact', 'send-info', 'left-voicemail', 'no-answer',
]);

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body: AnalyseCallRequest = await request.json();

    if (!body.transcript) {
      return Response.json(
        { outcome: 'no-answer' as CallOutcome, notes: '', followUpDate: null, emailRequested: false, error: 'No transcript provided.' } satisfies AnalyseCallResponse
      );
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return Response.json(
        { outcome: 'no-answer' as CallOutcome, notes: '', followUpDate: null, emailRequested: false, error: 'ANTHROPIC_API_KEY is not configured.' } satisfies AnalyseCallResponse,
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
          content: `You are analysing a business deal-sourcing phone call transcript. The caller (Mitchel Campbell from AR Business Brokers) was calling a business owner to explore whether they are interested in selling their business.

Business: ${body.companyName}
Contact: ${body.contactName}

Transcript:
${body.transcript}

Analyse the conversation and return ONLY a valid JSON object with these fields:

{
  "outcome": "interested" | "maybe" | "not-interested" | "wrong-contact" | "send-info" | "left-voicemail" | "no-answer",
  "notes": "2-3 sentence summary of what happened on the call and any key details mentioned (e.g., revenue, timeline, concerns)",
  "followUpDate": "YYYY-MM-DD if a specific follow-up date was mentioned, otherwise null",
  "emailRequested": true/false (whether the contact asked for or agreed to receive an email)
}

Outcome definitions:
- "interested": The contact expressed clear interest in learning more or meeting
- "maybe": The contact was non-committal, said "not right now", or expressed potential future interest
- "not-interested": The contact clearly declined
- "wrong-contact": The caller reached the wrong person or the contact is not the decision maker
- "send-info": The contact specifically asked for information to be sent (email, brochure, etc.)
- "left-voicemail": A voicemail message was left
- "no-answer": No meaningful conversation happened

If the contact agreed to receive an email (even if they said no to the opportunity), set emailRequested to true.`,
        },
      ],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '{}';

    let result: { outcome?: string; notes?: string; followUpDate?: string | null; emailRequested?: boolean } = {};
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        result = JSON.parse(match[0]);
      }
    } catch {
      result = {};
    }

    const outcome: CallOutcome = VALID_OUTCOMES.has(result.outcome ?? '')
      ? (result.outcome as CallOutcome)
      : 'maybe';
    const notes = typeof result.notes === 'string' ? result.notes : '';
    const followUpDate = typeof result.followUpDate === 'string' ? result.followUpDate : null;
    const emailRequested = result.emailRequested === true;

    // Update whisper context with outcome
    if (body.phone) {
      try {
        await updateWhisperOutcome(body.phone, outcome);
      } catch {
        // Non-fatal
      }
    }

    return Response.json({ outcome, notes, followUpDate, emailRequested } satisfies AnalyseCallResponse);
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : 'Call analysis failed.';
    console.error('[call/summarise]', err);
    return Response.json(
      { outcome: 'maybe' as CallOutcome, notes: '', followUpDate: null, emailRequested: false, error: errMessage } satisfies AnalyseCallResponse,
      { status: 500 }
    );
  }
}
