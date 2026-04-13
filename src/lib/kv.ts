import { Redis } from '@upstash/redis';
import type { WhisperContext, Voicemail, AgentSettings } from './types';

// Upstash Redis client.
// Supports both naming conventions:
//   - UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN  (Vercel Marketplace integration)
//   - KV_REST_API_URL / KV_REST_API_TOKEN                (Vercel KV / older Upstash integration)
function getRedis(): Redis {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error(
      'Missing Redis environment variables. ' +
        'Expected UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN ' +
        'or KV_REST_API_URL + KV_REST_API_TOKEN.'
    );
  }

  return new Redis({ url, token });
}

// ─── Whisper context ────────────────────────────────────────────────────────

const whisperKey = (phone: string) => `whisper:${phone}`;
const WHISPER_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export async function saveWhisperContext(
  phone: string,
  ctx: WhisperContext
): Promise<void> {
  const redis = getRedis();
  await redis.set(whisperKey(phone), JSON.stringify(ctx), {
    ex: WHISPER_TTL_SECONDS,
  });
}

export async function getWhisperContext(
  phone: string
): Promise<WhisperContext | null> {
  const redis = getRedis();
  const raw = await redis.get<string>(whisperKey(phone));
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : (raw as WhisperContext);
  } catch {
    return null;
  }
}

export async function updateWhisperOutcome(
  phone: string,
  callOutcome: string
): Promise<void> {
  const ctx = await getWhisperContext(phone);
  if (!ctx) return;
  await saveWhisperContext(phone, { ...ctx, callOutcome });
}

// ─── Voicemails ─────────────────────────────────────────────────────────────

const VOICEMAILS_KEY = 'voicemails';

export async function saveVoicemail(voicemail: Voicemail): Promise<void> {
  const redis = getRedis();
  await redis.lpush(VOICEMAILS_KEY, JSON.stringify(voicemail));
}

export async function getVoicemails(): Promise<Voicemail[]> {
  const redis = getRedis();
  const items = await redis.lrange<string>(VOICEMAILS_KEY, 0, 99);
  return items.map((item) => {
    try {
      return typeof item === 'string' ? JSON.parse(item) : (item as Voicemail);
    } catch {
      return null;
    }
  }).filter(Boolean) as Voicemail[];
}

export async function markVoicemailReviewed(id: string): Promise<void> {
  const redis = getRedis();
  const items = await redis.lrange<string>(VOICEMAILS_KEY, 0, 99);
  const updated = items.map((item) => {
    try {
      const vm: Voicemail =
        typeof item === 'string' ? JSON.parse(item) : (item as Voicemail);
      if (vm.id === id) return JSON.stringify({ ...vm, reviewed: true });
      return typeof item === 'string' ? item : JSON.stringify(item);
    } catch {
      return typeof item === 'string' ? item : JSON.stringify(item);
    }
  });

  const pipeline = redis.pipeline();
  pipeline.del(VOICEMAILS_KEY);
  for (const item of updated) {
    pipeline.rpush(VOICEMAILS_KEY, item);
  }
  await pipeline.exec();
}

// ─── Agent Settings ─────────────────────────────────────────────────────────

const SETTINGS_KEY = 'agent:settings';

export async function saveAgentSettings(settings: AgentSettings): Promise<void> {
  const redis = getRedis();
  await redis.set(SETTINGS_KEY, JSON.stringify(settings));
}

export async function getAgentSettings(): Promise<AgentSettings | null> {
  const redis = getRedis();
  const raw = await redis.get<string>(SETTINGS_KEY);
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : (raw as AgentSettings);
  } catch {
    return null;
  }
}

// ─── Business Research Cache ────────────────────────────────────────────────

const researchKey = (businessId: string) => `research:${businessId}`;
const RESEARCH_TTL = 60 * 60 * 24 * 7; // 7 days

export interface BusinessResearchCache {
  businessId: string;
  companyName: string;
  sourceUrl: string | null;
  rawText: string | null;
  researchNotes: string;
  suggestedTalkingPoints: string[];
  researchedAt: string;
}

export async function saveBusinessResearch(research: BusinessResearchCache): Promise<void> {
  const redis = getRedis();
  await redis.set(researchKey(research.businessId), JSON.stringify(research), {
    ex: RESEARCH_TTL,
  });
}

export async function getBusinessResearch(businessId: string): Promise<BusinessResearchCache | null> {
  const redis = getRedis();
  const raw = await redis.get<string>(researchKey(businessId));
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : (raw as BusinessResearchCache);
  } catch {
    return null;
  }
}
