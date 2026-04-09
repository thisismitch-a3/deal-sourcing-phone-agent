import type { NextRequest } from 'next/server';
import type { SearchApiRequest, SearchApiResponse, SearchApiRestaurant } from '@/lib/types';

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
  minRating: number,
  maxResults: number,
  cuisineType: string
): Promise<PlacesResult[]> {
  const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
  url.searchParams.set('location', `${lat},${lng}`);
  url.searchParams.set('radius', String(radius));
  url.searchParams.set('type', 'restaurant');
  url.searchParams.set('key', MAPS_KEY);
  if (cuisineType) url.searchParams.set('keyword', cuisineType);

  const res = await fetch(url.toString());
  const data = await res.json();

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Google Places error: ${data.status}`);
  }

  const results: PlacesResult[] = (data.results ?? []) as PlacesResult[];
  return results
    .filter((r) => (r.rating ?? 0) >= minRating)
    .slice(0, maxResults);
}

async function getPhoneNumber(placeId: string): Promise<string | null> {
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', placeId);
  url.searchParams.set('fields', 'formatted_phone_number,international_phone_number');
  url.searchParams.set('key', MAPS_KEY);

  try {
    const res = await fetch(url.toString());
    const data = await res.json();
    const result = data.result as PlaceDetailsResult | undefined;
    return result?.international_phone_number ?? result?.formatted_phone_number ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body: SearchApiRequest = await request.json();

    if (!body.location?.trim()) {
      return Response.json(
        { restaurants: [], error: 'Location is required.' } satisfies SearchApiResponse,
        { status: 400 }
      );
    }

    if (!MAPS_KEY) {
      return Response.json(
        { restaurants: [], error: 'Google Maps API key is not configured.' } satisfies SearchApiResponse,
        { status: 500 }
      );
    }

    // Step 1: Geocode
    const { lat, lng } = await geocode(body.location);

    // Step 2: Nearby restaurant search
    const places = await nearbySearch(
      lat,
      lng,
      body.radius,
      body.minRating,
      body.maxRestaurants,
      body.cuisineType ?? ''
    );

    if (places.length === 0) {
      return Response.json(
        { restaurants: [], error: 'No restaurants found matching your criteria. Try adjusting the filters.' } satisfies SearchApiResponse
      );
    }

    // Step 3: Fetch phone numbers in batches of 5
    const restaurants: SearchApiRestaurant[] = [];
    for (let i = 0; i < places.length; i += 5) {
      const batch = places.slice(i, i + 5);
      const phones = await Promise.all(batch.map((p) => getPhoneNumber(p.place_id)));
      batch.forEach((place, idx) => {
        restaurants.push({
          name: place.name,
          address: place.vicinity,
          rating: place.rating ?? null,
          phone: phones[idx],
          placeId: place.place_id,
        });
      });
    }

    return Response.json({ restaurants } satisfies SearchApiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed. Please try again.';
    return Response.json(
      { restaurants: [], error: message } satisfies SearchApiResponse,
      { status: 500 }
    );
  }
}
