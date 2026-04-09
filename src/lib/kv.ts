import { Redis } from '@upstash/redis';
import type { WhisperContext, Voicemail } from './types';

// Upstash Redis client — env vars are set automatically when you add the
// Upstash Redis integration via the Vercel Marketplace:
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
function getRedis(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      'Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN environment variables. ' +
        'Add the Upstash Redis integration to your Vercel project.'
    );
  }

  return new Redis({ url, token });
}

// ─── Whisper context ─────────────────────────────────────────────────────────

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

export async function updateWhisperMenuOptions(
  phone: string,
  safeMenuOptions: string[]
): Promise<void> {
  const ctx = await getWhisperContext(phone);
  if (!ctx) return;
  await saveWhisperContext(phone, { ...ctx, safeMenuOptions });
}

// ─── Voicemails ──────────────────────────────────────────────────────────────

const VOICEMAILS_KEY = 'voicemails';

export async function saveVoicemail(voicemail: Voicemail): Promise<void> {
  const redis = getRedis();
  // Store voicemails as a list (most recent first via LPUSH)
  await redis.lpush(VOICEMAILS_KEY, JSON.stringify(voicemail));
}

export async function getVoicemails(): Promise<Voicemail[]> {
  const redis = getRedis();
  // Retrieve up to 100 voicemails
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

  // Replace the list atomically
  const pipeline = redis.pipeline();
  pipeline.del(VOICEMAILS_KEY);
  for (const item of updated) {
    pipeline.rpush(VOICEMAILS_KEY, item);
  }
  await pipeline.exec();
}
