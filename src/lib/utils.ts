import { v4 as uuidv4 } from 'uuid';
import type { WhisperContext } from './types';

export function generateId(): string {
  return uuidv4();
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '1') {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

export function formatRating(n: number | null): string {
  if (n === null) return 'No rating';
  return `${n.toFixed(1)} ★`;
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-CA', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ─── Vapi outbound call helpers ──────────────────────────────────────────────

export function buildFirstMessage(restaurantName: string): string {
  return `Hi, I'm calling on behalf of Mitchel Campbell. I had a quick question about your menu — do you have a moment?`;
}

export function buildVapiSystemPrompt({
  restaurantName,
  dietaryRestrictions,
  specificDish,
}: {
  restaurantName: string;
  dietaryRestrictions: string;
  specificDish: string;
}): string {
  const specificDishLine = specificDish
    ? `\n- Ask specifically whether "${specificDish}" can be prepared without garlic or soy.`
    : '';

  return `You are a polite, conversational assistant calling ${restaurantName} on behalf of Mitchel Campbell.

Mitchel's dietary restrictions: ${dietaryRestrictions}. Note: cross-contamination is fine — he just needs dishes that don't contain these ingredients directly.

Your goals for this call:
1. Briefly introduce yourself as calling on behalf of Mitchel Campbell.
2. Ask which dishes on their menu are safe for someone with the restrictions above.${specificDishLine}
3. Note any safe dishes mentioned by the restaurant.
4. Be warm, brief, and conversational — this should feel like a friendly enquiry, not an interrogation.
5. Thank them sincerely and end the call within 3 minutes.

Important rules:
- Do not make up or assume any menu items.
- If they cannot help or don't know, thank them politely and end the call.
- Do not mention cross-contamination concerns unless asked.
- Do not read out a long list of restrictions — keep it simple.`;
}

// ─── Inbound whisper helper ──────────────────────────────────────────────────

export function buildWhisperPrompt(ctx: WhisperContext): string {
  const ratingStr = ctx.rating ? `rated ${ctx.rating.toFixed(1)} stars` : 'no rating listed';
  const menuStr =
    ctx.safeMenuOptions.length > 0
      ? `They found ${ctx.safeMenuOptions.length} safe dish${ctx.safeMenuOptions.length === 1 ? '' : 'es'} — ${ctx.safeMenuOptions.join(', ')}.`
      : `No safe dishes were confirmed on the original call.`;

  return `Generate a short spoken whisper message (2-3 sentences, under 25 seconds when read aloud) for Mitchel Campbell to hear before being connected to a restaurant callback.

Context:
- Restaurant: ${ctx.restaurantName}
- Location: ${ctx.neighborhood}
- Rating: ${ratingStr}
- Dietary restrictions discussed: ${ctx.dietaryRestrictions}
- Safe menu options found: ${menuStr}

The whisper should naturally summarise who is calling, the restaurant details, and what was found on the original call. Speak directly to Mitchel in second person. Do not include any stage directions or quotation marks — output only the spoken text.

Example style: "Incoming call from Giulietta's Trattoria on King Street West, rated 4.6 stars. You called them earlier about garlic and soy-free options. They found 3 safe dishes — the grilled branzino, mushroom risotto, and arugula salad."`;
}

export const FALLBACK_WHISPER = (phone: string) =>
  `Incoming call from ${phone}. No restaurant context was found for this number.`;

// ─── Inbound fallback agent system prompt ───────────────────────────────────

export const INBOUND_FALLBACK_SYSTEM_PROMPT = `You are answering calls on behalf of Mitchel Campbell.
Mitchel is currently unavailable.

When the call connects, say exactly:
"Hi, you've reached Mitchel Campbell's restaurant inquiry line. Mitchel is unavailable right now. Please leave your name, number, and a brief message and he'll get back to you shortly."

Then stay quiet and listen while they leave their message. Once they have finished, say "Thank you, I'll pass that along. Goodbye!" and end the call politely.

Do not improvise or say anything beyond what is described above.`;
