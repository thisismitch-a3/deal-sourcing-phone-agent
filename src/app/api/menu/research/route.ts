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

/**
 * Fetch a URL via Jina AI reader (r.jina.ai), which handles JavaScript-rendered
 * sites and returns clean markdown text. No API key required.
 */
async function fetchMenuText(url: string): Promise<string | null> {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const res = await fetch(jinaUrl, {
      signal: AbortSignal.timeout(20000),
      headers: { 'Accept': 'text/plain', 'X-No-Cache': 'true' },
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.trim() || null;
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
      console.log(`[menu/research] Google Places website for ${body.restaurantName}: ${websiteUrl ?? 'none'}`);
    } catch {
      console.log(`[menu/research] Google Places Details API failed for ${body.restaurantName}`);
    }

    // ── Step 2: Fetch menu text ──────────────────────────────────────────────
    let menuText: string | null = null;
    let sourceUrl: string | null = websiteUrl;

    if (!websiteUrl) {
      // No website in Google Places — try a Google search via Jina as fallback
      console.log(`[menu/research] No website URL — trying Google search fallback for ${body.restaurantName}`);
      const city = body.address ? body.address.split(',').slice(1, 2).join('').trim() : '';
      const searchQuery = `${body.restaurantName} ${city} menu`;
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
      console.log(`[menu/research] Search fallback URL: ${searchUrl}`);
      menuText = await fetchMenuText(searchUrl);
      console.log(`[menu/research] Search fallback text length: ${menuText?.length ?? 0}`);
      sourceUrl = searchUrl;
    } else {
      // Fetch the restaurant's own website via Jina (handles JS-rendered SPAs)
      console.log(`[menu/research] Fetching website via Jina: ${websiteUrl}`);
      menuText = await fetchMenuText(websiteUrl);
      console.log(`[menu/research] Home page text length: ${menuText?.length ?? 0}`);

      // If home page has sparse content, try common menu path variations
      if (!menuText || menuText.length < 300) {
        try {
          const base = new URL(websiteUrl).origin;
          const pathsToTry = ['/menu', '/our-menu', '/food', '/dining'];
          for (const path of pathsToTry) {
            const candidate = await fetchMenuText(`${base}${path}`);
            console.log(`[menu/research] ${path} text length: ${candidate?.length ?? 0}`);
            if (candidate && candidate.length > (menuText?.length ?? 0)) {
              menuText = candidate;
            }
          }
        } catch {
          // Ignore — URL parsing or fetch failure
        }
      }
    }

    if (!menuText || menuText.length < 100) {
      console.log(`[menu/research] Insufficient text content (${menuText?.length ?? 0} chars) for ${body.restaurantName}`);
      return Response.json(
        {
          status: 'no-menu',
          suggestedDishes: [],
          sourceUrl,
          error: websiteUrl
            ? `Website found (${websiteUrl}) but couldn't extract enough text — the site may block automated access.`
            : `No website listed on Google Maps, and the search fallback returned too little content.`,
        } satisfies MenuResearchResponse
      );
    }

    // Truncate to 8000 chars
    const truncatedText = menuText.slice(0, 8000);
    console.log(`[menu/research] Sending ${truncatedText.length} chars to Claude for ${body.restaurantName}`);

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
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: claudePrompt }],
      });
      const text =
        response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';

      console.log(`[menu/research] Claude raw response: ${text.slice(0, 200)}`);

      // Extract JSON array from the response (Claude sometimes adds preamble)
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        rawDishes = JSON.parse(match[0]);
      }
      console.log(`[menu/research] Claude identified ${rawDishes.length} raw dishes`);
    } catch (claudeErr) {
      const msg = claudeErr instanceof Error ? claudeErr.message : String(claudeErr);
      console.error(`[menu/research] Claude API error: ${msg}`);
      return Response.json(
        { status: 'no-menu', suggestedDishes: [], sourceUrl, error: `AI analysis failed: ${msg}` } satisfies MenuResearchResponse
      );
    }

    // ── Step 4: Validate, assign IDs, apply confidence threshold ────────────
    const validConfidences = new Set(['high', 'medium', 'low']);
    const suggestedDishes: SuggestedDish[] = rawDishes
      .filter((d) => d.name && validConfidences.has(d.confidence))
      .map((d) => ({
        id: generateId(),
        name: String(d.name).trim(),
        confidence: d.confidence as SuggestedDish['confidence'],
        reasoning: String(d.reasoning ?? '').trim(),
        approved: false,
      }))
      .filter((d) => meetsThreshold(d.confidence, settings.menuResearchConfidenceThreshold));

    console.log(`[menu/research] After threshold filter: ${suggestedDishes.length} dishes`);

    if (suggestedDishes.length === 0) {
      return Response.json(
        {
          status: 'no-menu',
          suggestedDishes: [],
          sourceUrl,
          error: 'Claude analysed the menu but could not identify any dishes that are clearly safe given the dietary restrictions.',
        } satisfies MenuResearchResponse
      );
    }

    // ── Step 5: Save to Redis ────────────────────────────────────────────────
    const research: MenuResearch = {
      restaurantId: body.restaurantId,
      restaurantName: body.restaurantName,
      sourceUrl,
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
      sourceUrl,
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
