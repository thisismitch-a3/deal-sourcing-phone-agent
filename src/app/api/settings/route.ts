import type { NextRequest } from 'next/server';
import { getAgentSettings, saveAgentSettings } from '@/lib/kv';
import { DEFAULT_AGENT_SETTINGS } from '@/lib/utils';
import type { AgentSettings } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Only keep keys that exist in the current AgentSettings schema.
// This strips stale keys left over from the old restaurant app.
const VALID_KEYS = new Set(Object.keys(DEFAULT_AGENT_SETTINGS));
function filterValidKeys(obj: Record<string, unknown>): AgentSettings {
  return Object.fromEntries(
    Object.entries(obj).filter(([k]) => VALID_KEYS.has(k))
  ) as unknown as AgentSettings;
}

export async function GET(): Promise<Response> {
  try {
    const stored = await getAgentSettings();
    // Merge with defaults so any new fields added later are present,
    // then strip unknown keys from old app versions
    const settings = filterValidKeys({ ...DEFAULT_AGENT_SETTINGS, ...stored });
    return Response.json({ settings });
  } catch (err) {
    console.error('[settings GET]', err);
    // Return defaults so the UI always has something to render
    return Response.json({ settings: DEFAULT_AGENT_SETTINGS });
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = await request.json();

    // Merge incoming body with defaults, then strip stale keys before saving
    const settings = filterValidKeys({
      ...DEFAULT_AGENT_SETTINGS,
      ...body,
      updatedAt: new Date().toISOString(),
    });

    await saveAgentSettings(settings);
    return Response.json({ settings });
  } catch (err) {
    console.error('[settings POST]', err);
    return Response.json({ error: 'Failed to save settings.' }, { status: 500 });
  }
}
