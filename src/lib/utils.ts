import { v4 as uuidv4 } from 'uuid';
import type { WhisperContext, AgentSettings, SuggestedDish } from './types';

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

// ─── Agent Settings defaults ─────────────────────────────────────────────────

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  // Identity & Introduction
  ownerName: 'Mitchel Campbell',
  openingLine:
    "Hi, I'm calling on behalf of Mitchel Campbell. I had a quick question about your menu — do you have a moment?",
  callerTone: 'friendly',

  // Dietary Restrictions & Conversation
  dietaryRestrictions: 'garlic, soy',
  crossContaminationOk: true,
  restrictionNotes: '',
  dishPreferences: '',
  uncertaintyBehaviour: 'escalate',

  // Call Behaviour
  maxCallDurationSeconds: 180,
  callStyle: 'brief',
  endCallIfUnableToHelp: true,
  silenceTimeoutSeconds: 10,
  holdBehaviour: 'wait',
  maxRetries: 1,
  retryDelayMinutes: 15,

  // Voice & Audio
  voiceStability: 0.5,
  voiceSimilarityBoost: 0.75,
  voiceSpeed: 1.0,
  voiceStyle: 0.0,
  fillerWordsEnabled: false,
  backgroundDenoisingEnabled: true,

  // Inbound / Callback
  whisperEnabled: true,
  whisperStyle: 'brief',
  forwardingNumber: '',
  ringTimeoutSeconds: 20,
  fallbackBehaviour: 'voicemail',

  // Voicemail handling (outbound)
  voicemailBehaviour: 'hang-up',
  voicemailScript:
    "Hi, this is a message for {restaurantName}. I'm calling on behalf of {ownerName} regarding menu options for someone with dietary restrictions. Please call back at your convenience. Thank you.",

  // Menu Research
  menuResearchEnabled: true,
  menuResearchMaxDishes: 3,
  menuResearchConfidenceThreshold: 'low',

  // Notifications
  notifyOnCallComplete: false,
  notifyEmail: '',
  notifyOnMissedCallback: false,
  webhookUrl: '',

  // Dashboard Defaults
  defaultSearchRadius: 5,
  defaultMinRating: 3.5,
  defaultCuisineType: '',
  defaultMaxRestaurants: 10,
  autoStartCalls: false,

  updatedAt: '',
};

// ─── Vapi outbound call helpers ──────────────────────────────────────────────

/** Returns the opening line (firstMessage) for a call, substituting restaurant name. */
export function buildFirstMessage(restaurantName: string, settings?: AgentSettings): string {
  const template = settings?.openingLine ?? DEFAULT_AGENT_SETTINGS.openingLine;
  return template.replace(/\{restaurantName\}/g, restaurantName);
}

/**
 * Builds the system prompt for an outbound call using agent settings.
 * `dietaryRestrictions` from the call request takes precedence over the settings default.
 */
export function buildVapiSystemPromptFromSettings({
  restaurantName,
  dietaryRestrictions,
  specificDish,
  settings,
  approvedDishes,
}: {
  restaurantName: string;
  dietaryRestrictions: string;
  specificDish: string;
  settings: AgentSettings;
  approvedDishes?: SuggestedDish[];
}): string {
  // Call-level restrictions override the settings default if provided
  const restrictions = dietaryRestrictions.trim() || settings.dietaryRestrictions;

  const specificDishLine = specificDish
    ? `\n- Ask specifically whether "${specificDish}" can be prepared without ${restrictions}.`
    : '';

  const crossContaminationLine = settings.crossContaminationOk
    ? ' Note: cross-contamination is fine — only dishes that directly contain these ingredients are a problem.'
    : ' Note: cross-contamination must also be avoided — even trace amounts are a concern.';

  const restrictionNotesLine = settings.restrictionNotes.trim()
    ? `\n\nAdditional notes about restrictions: ${settings.restrictionNotes.trim()}`
    : '';

  const maxMinutes = Math.ceil(settings.maxCallDurationSeconds / 60);

  const styleInstructions =
    settings.callStyle === 'thorough'
      ? `Be thorough — ask follow-up questions about ingredients and preparation methods if needed. It is fine to spend extra time getting complete, accurate information.`
      : `Be warm, brief, and conversational — this should feel like a friendly enquiry, not an interrogation.`;

  const endCallLine =
    settings.endCallIfUnableToHelp
      ? `- If they cannot help or don't know, thank them politely and end the call.`
      : `- If the first person you speak with cannot help, politely ask to speak with someone who might know, such as the chef or manager.`;

  const voicemailLine =
    settings.voicemailBehaviour === 'leave-message'
      ? `- If you reach voicemail, leave this message: "${settings.voicemailScript
          .replace(/\{restaurantName\}/g, restaurantName)
          .replace(/\{ownerName\}/g, settings.ownerName)}" — then hang up.`
      : `- If you reach voicemail, hang up politely without leaving a message.`;

  const approvedDishLine =
    approvedDishes && approvedDishes.length > 0
      ? `\n\nBefore the call, the following dishes were pre-identified as likely safe:\n${approvedDishes.map((d) => `- ${d.name}`).join('\n')}\nPlease confirm with the restaurant whether each of these is safe, and also ask generally what else on the menu might be safe.`
      : '';

  const toneInstruction =
    settings.callerTone === 'professional'
      ? 'Speak in a professional, polished manner. Use complete sentences and formal language.'
      : settings.callerTone === 'casual'
      ? 'Speak casually and naturally — as if chatting with a neighbour. Contractions and informal language are fine.'
      : 'Speak in a warm and friendly tone — approachable and conversational, not stiff.';

  const fillerLine = settings.fillerWordsEnabled
    ? 'You may use natural filler words ("um", "uh", "you know") and brief pauses to sound more human.'
    : 'Speak clearly and avoid filler words.';

  const dishPreferencesLine = settings.dishPreferences?.trim()
    ? `\n\nDish preferences: ${settings.dishPreferences.trim()} — prioritise these types of dishes when asking about safe options.`
    : '';

  const uncertaintyLine =
    settings.uncertaintyBehaviour === 'accept'
      ? '- If the restaurant is unsure whether a dish is safe, accept their best guess and note it as uncertain.'
      : settings.uncertaintyBehaviour === 'ask-again'
      ? '- If the restaurant is unsure, gently rephrase the question once and ask again before accepting the answer.'
      : '- If the restaurant is unsure, ask to speak with someone more knowledgeable (e.g. the chef or manager) before accepting the answer.';

  const holdLine =
    settings.holdBehaviour === 'hang-up'
      ? '- If you are placed on hold, wait up to 30 seconds, then politely end the call.'
      : '- If you are placed on hold, wait patiently for as long as needed.';

  return `You are a polite, conversational phone assistant calling ${restaurantName} on behalf of ${settings.ownerName}.

${toneInstruction} ${fillerLine}

Dietary restrictions to enquire about: ${restrictions}.${crossContaminationLine}${restrictionNotesLine}${dishPreferencesLine}${approvedDishLine}

Your goals for this call:
1. Briefly introduce yourself as calling on behalf of ${settings.ownerName}.
2. Ask which dishes on their menu are safe for someone with the restrictions above.${specificDishLine}
3. Note any safe dishes mentioned by the restaurant.
4. ${styleInstructions}
5. Thank them sincerely and end the call within ${maxMinutes} minute${maxMinutes !== 1 ? 's' : ''}.

Important rules:
- Do not make up or assume any menu items.
${endCallLine}
${uncertaintyLine}
${holdLine}
- Do not mention cross-contamination concerns unless asked.
- Do not read out a long list of restrictions — keep it concise.
${voicemailLine}`;
}

/**
 * Legacy wrapper — used by code paths that don't have settings loaded.
 * Delegates to buildVapiSystemPromptFromSettings with defaults.
 */
export function buildVapiSystemPrompt({
  restaurantName,
  dietaryRestrictions,
  specificDish,
}: {
  restaurantName: string;
  dietaryRestrictions: string;
  specificDish: string;
}): string {
  return buildVapiSystemPromptFromSettings({
    restaurantName,
    dietaryRestrictions,
    specificDish,
    settings: DEFAULT_AGENT_SETTINGS,
  });
}

// ─── Inbound whisper helper ──────────────────────────────────────────────────

export function buildWhisperPrompt(ctx: WhisperContext, style: 'brief' | 'detailed' = 'brief'): string {
  const ratingStr = ctx.rating ? `rated ${ctx.rating.toFixed(1)} stars` : 'no rating listed';
  const menuStr =
    ctx.safeMenuOptions.length > 0
      ? `They found ${ctx.safeMenuOptions.length} safe dish${ctx.safeMenuOptions.length === 1 ? '' : 'es'} — ${ctx.safeMenuOptions.join(', ')}.`
      : `No safe dishes were confirmed on the original call.`;

  const styleInstruction =
    style === 'detailed'
      ? `Include the restaurant name, full neighbourhood or address, rating, dietary restrictions discussed, and all safe dishes found. Aim for 3–4 sentences.`
      : `Keep it to 2–3 sentences — restaurant name, key result, and any safe dishes found.`;

  return `Generate a short spoken whisper message for Mitchel Campbell to hear before being connected to a restaurant callback.

Context:
- Restaurant: ${ctx.restaurantName}
- Location: ${ctx.neighborhood}
- Rating: ${ratingStr}
- Dietary restrictions discussed: ${ctx.dietaryRestrictions}
- Safe menu options found: ${menuStr}

Instructions: ${styleInstruction} Speak directly to Mitchel in second person. Do not include stage directions or quotation marks — output only the spoken text.

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
