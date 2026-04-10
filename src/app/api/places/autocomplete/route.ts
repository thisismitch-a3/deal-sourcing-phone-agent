import type { NextRequest } from 'next/server';
import type { PlacesAutocompleteResponse, PlaceSuggestion } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface TextSearchResult {
  place_id: string;
  name: string;
  formatted_address: string;
  rating?: number;
}

export async function GET(request: NextRequest): Promise<Response> {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';

  if (q.length < 2) {
    return Response.json({ places: [] } satisfies PlacesAutocompleteResponse);
  }

  const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!mapsKey) {
    return Response.json(
      { places: [], error: 'Google Maps API key not configured.' } satisfies PlacesAutocompleteResponse,
      { status: 500 }
    );
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
    url.searchParams.set('query', q);
    url.searchParams.set('type', 'restaurant');
    url.searchParams.set('key', mapsKey);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
    const data = await res.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return Response.json({ places: [] } satisfies PlacesAutocompleteResponse);
    }

    const places: PlaceSuggestion[] = ((data.results ?? []) as TextSearchResult[])
      .slice(0, 6)
      .map((r) => ({
        placeId: r.place_id,
        name: r.name,
        address: r.formatted_address,
        rating: r.rating ?? null,
      }));

    return Response.json({ places } satisfies PlacesAutocompleteResponse);
  } catch {
    return Response.json({ places: [] } satisfies PlacesAutocompleteResponse);
  }
}
