import type { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { saveBusinessResearch } from '@/lib/kv';
import type { BusinessResearchRequest, BusinessResearchResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function fetchPageText(url: string): Promise<string | null> {
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
    const body: BusinessResearchRequest = await request.json();

    if (!body.businessId || !body.companyName) {
      return Response.json(
        { status: 'no-info', researchNotes: '', suggestedTalkingPoints: [], sourceUrl: null, error: 'Missing required fields.' } satisfies BusinessResearchResponse,
        { status: 400 }
      );
    }

    const googleMapsKey = process.env.GOOGLE_MAPS_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!anthropicKey) {
      return Response.json(
        { status: 'no-info', researchNotes: '', suggestedTalkingPoints: [], sourceUrl: null, error: 'Anthropic API key not configured.' } satisfies BusinessResearchResponse,
        { status: 500 }
      );
    }

    // Step 1: Get website URL from Google Places Details
    let websiteUrl: string | null = null;
    if (body.placeId && googleMapsKey) {
      try {
        const detailsUrl =
          `https://maps.googleapis.com/maps/api/place/details/json` +
          `?place_id=${encodeURIComponent(body.placeId)}&fields=website&key=${googleMapsKey}`;
        const detailsRes = await fetch(detailsUrl, { signal: AbortSignal.timeout(5000) });
        const detailsData = await detailsRes.json();
        websiteUrl = detailsData?.result?.website ?? null;
        console.log(`[business/research] Google Places website for ${body.companyName}: ${websiteUrl ?? 'none'}`);
      } catch {
        console.log(`[business/research] Google Places Details API failed for ${body.companyName}`);
      }
    }

    // Step 2: Fetch page text
    let pageText: string | null = null;
    let sourceUrl: string | null = websiteUrl;

    if (websiteUrl) {
      console.log(`[business/research] Fetching website via Jina: ${websiteUrl}`);
      pageText = await fetchPageText(websiteUrl);

      // Try common about/services pages if home page is sparse
      if (!pageText || pageText.length < 300) {
        try {
          const base = new URL(websiteUrl).origin;
          const pathsToTry = ['/about', '/about-us', '/services', '/our-services'];
          for (const path of pathsToTry) {
            const candidate = await fetchPageText(`${base}${path}`);
            if (candidate && candidate.length > (pageText?.length ?? 0)) {
              pageText = candidate;
            }
          }
        } catch {
          // Ignore
        }
      }
    }

    if (!pageText || pageText.length < 100) {
      // Fallback: Google search
      const city = body.address?.split(',').slice(1, 2).join('').trim() || '';
      const searchQuery = `${body.companyName} ${city} ${body.industry}`;
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
      console.log(`[business/research] Search fallback: ${searchQuery}`);
      pageText = await fetchPageText(searchUrl);
      sourceUrl = searchUrl;
    }

    if (!pageText || pageText.length < 50) {
      return Response.json({
        status: 'no-info',
        researchNotes: '',
        suggestedTalkingPoints: [],
        sourceUrl,
        error: 'Could not find enough information about this business online.',
      } satisfies BusinessResearchResponse);
    }

    // Truncate to 8000 chars
    const truncatedText = pageText.slice(0, 8000);

    // Step 3: Claude analysis
    const claudePrompt = `You are a business research analyst preparing notes for a deal sourcing call. Analyse this company's web content and extract useful information for a cold call about a potential business acquisition.

Company: ${body.companyName}
Industry: ${body.industry || 'Unknown'}

Website content:
---
${truncatedText}
---

Return ONLY a valid JSON object with these fields:
{
  "researchNotes": "A 2-4 sentence summary of what the company does, key services/products, approximate size indicators (number of employees, locations, years in business), and any notable details that would be useful on a call.",
  "suggestedTalkingPoints": ["Array of 2-4 specific talking points or conversation angles based on the research. Each should be a brief actionable suggestion for the caller."]
}

Focus on information relevant to a business acquisition conversation:
- What does the company actually do?
- How established are they? (years in business, multiple locations, team size)
- Any specializations or niche focus?
- Anything that suggests the business is thriving (awards, growth, new services)?
- Any angles that could make an acquisition conversation relevant?

If you cannot extract meaningful information, return empty strings/arrays.`;

    try {
      const anthropic = new Anthropic({ apiKey: anthropicKey });
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: claudePrompt }],
      });
      const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';

      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        return Response.json({
          status: 'no-info',
          researchNotes: '',
          suggestedTalkingPoints: [],
          sourceUrl,
          error: 'AI analysis returned unexpected format.',
        } satisfies BusinessResearchResponse);
      }

      const parsed = JSON.parse(match[0]) as {
        researchNotes?: string;
        suggestedTalkingPoints?: string[];
      };

      const researchNotes = parsed.researchNotes?.trim() || '';
      const suggestedTalkingPoints = Array.isArray(parsed.suggestedTalkingPoints)
        ? parsed.suggestedTalkingPoints.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        : [];

      // Save to Redis cache
      try {
        await saveBusinessResearch({
          businessId: body.businessId,
          companyName: body.companyName,
          sourceUrl,
          rawText: truncatedText,
          researchNotes,
          suggestedTalkingPoints,
          researchedAt: new Date().toISOString(),
        });
      } catch {
        // Non-fatal
      }

      return Response.json({
        status: 'complete',
        researchNotes,
        suggestedTalkingPoints,
        sourceUrl,
      } satisfies BusinessResearchResponse);
    } catch (claudeErr) {
      const msg = claudeErr instanceof Error ? claudeErr.message : String(claudeErr);
      console.error(`[business/research] Claude API error: ${msg}`);
      return Response.json({
        status: 'no-info',
        researchNotes: '',
        suggestedTalkingPoints: [],
        sourceUrl,
        error: `AI analysis failed: ${msg}`,
      } satisfies BusinessResearchResponse);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Business research failed.';
    console.error('[business/research]', err);
    return Response.json(
      { status: 'no-info', researchNotes: '', suggestedTalkingPoints: [], sourceUrl: null, error: message } satisfies BusinessResearchResponse,
      { status: 500 }
    );
  }
}
