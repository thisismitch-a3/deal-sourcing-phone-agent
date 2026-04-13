import type { NextRequest } from 'next/server';
import type { SearchApiRequest, SearchApiResponse, SearchApiBusiness } from '@/lib/types';

export const dynamic = 'force-dynamic';

const MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY!;

interface GeocodingResult {
  geometry: { location: { lat: number; lng: number } };
}

interface PlacesResult {
  place_id: string;
  name: string;
  vicinity: string;
  rating?: number;
}

interface PlaceDetailsResult {
  formatted_phone_number?: string;
  international_phone_number?: string;
  website?: string;
}

async function geocode(location: string): Promise<{ lat: number; lng: number }> {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', location);
  url.searchParams.set('key', MAPS_KEY);

  const res = await fetch(url.toString());
  const data = await res.json();

  if (data.status !== 'OK' || !data.results?.length) {
    throw new Error('Location not found. Try a more specific address.');
  }

  const { lat, lng } = (data.results[0] as GeocodingResult).geometry.location;
  return { lat, lng };
}

async function nearbySearch(
  lat: number,
  lng: number,
  radius: number,
  maxResults: number,
  businessType: string
): Promise<PlacesResult[]> {
  const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
  url.searchParams.set('location', `${lat},${lng}`);
  url.searchParams.set('radius', String(radius));
  url.searchParams.set('key', MAPS_KEY);
  if (businessType) url.searchParams.set('keyword', businessType);

  const res = await fetch(url.toString());
  const data = await res.json();

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Google Places error: ${data.status}`);
  }

  const results: PlacesResult[] = (data.results ?? []) as PlacesResult[];
  return results.slice(0, maxResults);
}

async function getPlaceDetails(placeId: string): Promise<{ phone: string | null; website: string | null }> {
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', placeId);
  url.searchParams.set('fields', 'formatted_phone_number,international_phone_number,website');
  url.searchParams.set('key', MAPS_KEY);

  try {
    const res = await fetch(url.toString());
    const data = await res.json();
    const result = data.result as PlaceDetailsResult | undefined;
    return {
      phone: result?.international_phone_number ?? result?.formatted_phone_number ?? null,
      website: result?.website ?? null,
    };
  } catch {
    return { phone: null, website: null };
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body: SearchApiRequest = await request.json();

    if (!body.location?.trim()) {
      return Response.json(
        { businesses: [], error: 'Location is required.' } satisfies SearchApiResponse,
        { status: 400 }
      );
    }

    if (!MAPS_KEY) {
      return Response.json(
        { businesses: [], error: 'Google Maps API key is not configured.' } satisfies SearchApiResponse,
        { status: 500 }
      );
    }

    // Step 1: Geocode
    const { lat, lng } = await geocode(body.location);

    // Step 2: Nearby business search
    const places = await nearbySearch(
      lat,
      lng,
      body.radius,
      body.maxBusinesses,
      body.businessType ?? ''
    );

    if (places.length === 0) {
      return Response.json(
        { businesses: [], error: 'No businesses found matching your criteria. Try adjusting the filters.' } satisfies SearchApiResponse
      );
    }

    // Step 3: Fetch phone numbers and websites in batches of 5
    const businesses: SearchApiBusiness[] = [];
    for (let i = 0; i < places.length; i += 5) {
      const batch = places.slice(i, i + 5);
      const details = await Promise.all(batch.map((p) => getPlaceDetails(p.place_id)));
      batch.forEach((place, idx) => {
        businesses.push({
          name: place.name,
          address: place.vicinity,
          phone: details[idx].phone,
          placeId: place.place_id,
          website: details[idx].website,
        });
      });
    }

    return Response.json({ businesses } satisfies SearchApiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed. Please try again.';
    return Response.json(
      { businesses: [], error: message } satisfies SearchApiResponse,
      { status: 500 }
    );
  }
}
