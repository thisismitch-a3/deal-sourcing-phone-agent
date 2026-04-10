import type { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { saveMenuResearch, getAgentSettings } from '@/lib/kv';
import { DEFAULT_AGENT_SETTINGS } from '@/lib/utils';
import { generateId } from '@/lib/utils';
import type {
  MenuResearchRequest,
  MenuResearchResponse,
  SuggestedDish,
  MenuResearch,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

const CONFIDENCE_ORDER: Record<SuggestedDish['confidence'], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function meetsThreshold(
  confidence: SuggestedDish['confidence'],
  threshold: 'low' | 'medium' | 'high'
): boolean {
  return CONFIDENCE_ORDER[confidence] >= CONFIDENCE_ORDER[threshold];
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchMenuText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MenuResearchBot/1.0)' },
    });
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('pdf') || contentType.includes('application/')) {
      return null; // can't parse binary formats
    }
    const html = await res.text();
    return stripHtml(html);
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body: MenuResearchRequest = await request.json();

    if (!body.restaurantId || !body.restaurantName || !body.placeId) {
      return Response.json(
        { status: 'no-menu', suggestedDishes: [], sourceUrl: null, error: 'Missing required fields.' } satisfies MenuResearchResponse,
        { status: 400 }
      );
    }

    const googleMapsKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!googleMapsKey) {
      return Response.json(
        { status: 'no-menu', suggestedDishes: [], sourceUrl: null, error: 'Google Maps API key not configured.' } satisfies MenuResearchResponse,
        { status: 500 }
      );
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return Response.json(
        { status: 'no-menu', suggestedDishes: [], sourceUrl: null, error: 'Anthropic API key not configured.' } satisfies MenuResearchResponse,
        { status: 500 }
      );
    }

    // Load agent settings
    const storedSettings = await getAgentSettings().catch(() => null);
    const settings = { ...DEFAULT_AGENT_SETTINGS, ...storedSettings };

    // ── Step 1: Get restaurant website from Google Places Details ────────────
    let websiteUrl: string | null = null;
    try {
      const detailsUrl =
        `https://maps.googleapis.com/maps/api/place/details/json` +
        `?place_id=${encodeURIComponent(body.placeId)}&fields=website&key=${googleMapsKey}`;
      const detailsRes = await fetch(detailsUrl, { signal: AbortSignal.timeout(5000) });
      const detailsData = await detailsRes.json();
      websiteUrl = detailsData?.result?.website ?? null;
    } catch {
      // Non-fatal — proceed to no-menu
    }

    if (!websiteUrl) {
      return Response.json(
        { status: 'no-menu', suggestedDishes: [], sourceUrl: null } satisfies MenuResearchResponse
      );
    }

    // ── Step 2: Fetch website and extract text ───────────────────────────────
    let menuText = await fetchMenuText(websiteUrl);

    // If home page has very little content, try /menu path
    if (!menuText || menuText.length < 300) {
      try {
        const base = new URL(websiteUrl).origin;
        const menuPageText = await fetchMenuText(`${base}/menu`);
        if (menuPageText && menuPageText.length > (menuText?.length ?? 0)) {
          menuText = menuPageText;
        }
      } catch {
        // Ignore — URL parsing or fetch failure
      }
    }

    if (!menuText || menuText.length < 100) {
      return Response.json(
        { status: 'no-menu', suggestedDishes: [], sourceUrl: websiteUrl } satisfies MenuResearchResponse
      );
    }

    // Truncate to 8000 chars
    const truncatedText = menuText.slice(0, 8000);

    // ── Step 3: Claude analysis ──────────────────────────────────────────────
    const specificDishLine = body.specificDish
      ? `\nThe user is also specifically interested in whether "${body.specificDish}" is available safely.`
      : '';

    const claudePrompt = `Analyse this restaurant's website content and identify up to ${settings.menuResearchMaxDishes} dishes that are likely safe for someone avoiding: ${body.dietaryRestrictions || settings.dietaryRestrictions} (cross-contamination is fine).${specificDishLine}

Restaurant: ${body.restaurantName}
Website content:
---
${truncatedText}
---

Return ONLY a valid JSON array. Each item must have: "name" (string), "confidence" ("high"|"medium"|"low"), "reasoning" (1-2 sentences).
- high: dish clearly contains none of the restricted ingredients
- medium: probably safe but some ingredients are unclear
- low: might be safe but notable uncertainty

Example: [{"name":"Grilled Salmon","confidence":"high","reasoning":"Simple preparation with olive oil and lemon — no garlic or soy mentioned."}]

If you cannot identify any potentially safe dishes from this content, return [].`;

    let rawDishes: { name: string; confidence: string; reasoning: string }[] = [];
    try {
      const anthropic = new Anthropic({ apiKey: anthropicKey });
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: claudePrompt }],
      });
      const text =
        response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';

      // Extract JSON array from the response (Claude sometimes adds preamble)
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        rawDishes = JSON.parse(match[0]);
      }
    } catch {
      // Claude failure → no-menu
      return Response.json(
        { status: 'no-menu', suggestedDishes: [], sourceUrl: websiteUrl } satisfies MenuResearchResponse
      );
    }

    // ── Step 4: Validate, assign IDs, apply confidence threshold ────────────
    const validConfidences = new Set(['high', 'medium', 'low']);
    let suggestedDishes: SuggestedDish[] = rawDishes
      .filter((d) => d.name && validConfidences.has(d.confidence))
      .map((d) => ({
        id: generateId(),
        name: String(d.name).trim(),
        confidence: d.confidence as SuggestedDish['confidence'],
        reasoning: String(d.reasoning ?? '').trim(),
        approved: false,
      }))
      .filter((d) => meetsThreshold(d.confidence, settings.menuResearchConfidenceThreshold));

    if (suggestedDishes.length === 0) {
      return Response.json(
        { status: 'no-menu', suggestedDishes: [], sourceUrl: websiteUrl } satisfies MenuResearchResponse
      );
    }

    // ── Step 5: Save to Redis ────────────────────────────────────────────────
    const research: MenuResearch = {
      restaurantId: body.restaurantId,
      restaurantName: body.restaurantName,
      sourceUrl: websiteUrl,
      rawMenuText: truncatedText,
      suggestedDishes,
      researchedAt: new Date().toISOString(),
    };

    try {
      await saveMenuResearch(research);
    } catch {
      // Non-fatal — still return results even if Redis save fails
    }

    return Response.json({
      status: 'complete',
      suggestedDishes,
      sourceUrl: websiteUrl,
    } satisfies MenuResearchResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Menu research failed.';
    console.error('[menu/research]', err);
    return Response.json(
      { status: 'no-menu', suggestedDishes: [], sourceUrl: null, error: message } satisfies MenuResearchResponse,
      { status: 500 }
    );
  }
}
