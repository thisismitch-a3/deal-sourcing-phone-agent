'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveSession, upsertRestaurant } from '@/lib/storage';
import { generateId } from '@/lib/utils';
import type { SearchFormValues, SearchApiResponse, Restaurant, SearchSession } from '@/lib/types';
import ErrorMessage from '@/components/ErrorMessage';
import LoadingSpinner from '@/components/LoadingSpinner';

const DEFAULT_FORM: SearchFormValues = {
  location: '',
  radius: 2000,
  minRating: 4.0,
  maxRestaurants: 10,
  cuisineType: '',
  dietaryRestrictions: 'No garlic, no soy — cross-contamination is fine',
  whatToAsk: 'general',
  specificDish: '',
};

const RADIUS_OPTIONS = [
  { value: 500, label: '500 m' },
  { value: 1000, label: '1 km' },
  { value: 2000, label: '2 km' },
  { value: 5000, label: '5 km' },
  { value: 10000, label: '10 km' },
];

const RATING_OPTIONS = [
  { value: 3.5, label: '3.5+' },
  { value: 4.0, label: '4.0+' },
  { value: 4.5, label: '4.5+' },
];

const MAX_OPTIONS = [3, 5, 10];

export default function SearchPage() {
  const router = useRouter();
  const [form, setForm] = useState<SearchFormValues>(DEFAULT_FORM);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof SearchFormValues>(key: K, value: SearchFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.location.trim()) {
      setError('Please enter a location.');
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: form.location.trim(),
          radius: form.radius,
          minRating: form.minRating,
          maxRestaurants: form.maxRestaurants,
          cuisineType: form.cuisineType.trim(),
        }),
      });

      const data: SearchApiResponse = await res.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      if (!data.restaurants.length) {
        setError('No restaurants found. Try adjusting the filters.');
        return;
      }

      // Create a new search session
      const sessionId = generateId();
      const session: SearchSession = {
        id: sessionId,
        createdAt: new Date().toISOString(),
        location: form.location.trim(),
        radius: form.radius,
        minRating: form.minRating,
        maxRestaurants: form.maxRestaurants,
        cuisineType: form.cuisineType.trim(),
        dietaryRestrictions: form.dietaryRestrictions,
        whatToAsk: form.whatToAsk,
        specificDish: form.specificDish.trim(),
      };
      saveSession(session);

      // Persist each restaurant to localStorage
      data.restaurants.forEach((r) => {
        const restaurant: Restaurant = {
          id: generateId(),
          searchSessionId: sessionId,
          createdAt: new Date().toISOString(),
          name: r.name,
          address: r.address,
          rating: r.rating,
          phone: r.phone,
          placeId: r.placeId,
          callId: null,
          callStatus: r.phone ? 'pending' : 'no-phone',
          transcript: null,
          recordingUrl: null,
          safeMenuOptions: [],
          confirmed: false,
          notSuitable: false,
        };
        upsertRestaurant(restaurant);
      });

      router.push('/');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold text-zinc-900">Find Restaurants</h1>

      <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <ErrorMessage message={error} onDismiss={() => setError(null)} />

        {/* Location */}
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="location">
            Location <span className="text-red-500">*</span>
          </label>
          <input
            id="location"
            type="text"
            placeholder="e.g. Downtown Toronto, ON"
            value={form.location}
            onChange={(e) => update('location', e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            required
          />
        </div>

        {/* Radius + Rating */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="radius">
              Search Radius
            </label>
            <select
              id="radius"
              value={form.radius}
              onChange={(e) => update('radius', Number(e.target.value))}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            >
              {RADIUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="minRating">
              Minimum Rating
            </label>
            <select
              id="minRating"
              value={form.minRating}
              onChange={(e) => update('minRating', Number(e.target.value))}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            >
              {RATING_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Max restaurants + Cuisine */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="maxRestaurants">
              Max Restaurants to Call
            </label>
            <select
              id="maxRestaurants"
              value={form.maxRestaurants}
              onChange={(e) => update('maxRestaurants', Number(e.target.value))}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            >
              {MAX_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="cuisineType">
              Cuisine Type <span className="text-zinc-400 font-normal">(optional)</span>
            </label>
            <input
              id="cuisineType"
              type="text"
              placeholder="e.g. Italian, Sushi"
              value={form.cuisineType}
              onChange={(e) => update('cuisineType', e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            />
          </div>
        </div>

        {/* Dietary restrictions */}
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="dietaryRestrictions">
            Dietary Restrictions
          </label>
          <textarea
            id="dietaryRestrictions"
            rows={2}
            value={form.dietaryRestrictions}
            onChange={(e) => update('dietaryRestrictions', e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
        </div>

        {/* What to ask */}
        <div>
          <p className="mb-2 text-sm font-medium text-zinc-700">What to ask the restaurant</p>
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
              <input
                type="radio"
                name="whatToAsk"
                value="general"
                checked={form.whatToAsk === 'general'}
                onChange={() => update('whatToAsk', 'general')}
                className="accent-zinc-900"
              />
              Safe dishes only — ask what&apos;s generally safe on the menu
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
              <input
                type="radio"
                name="whatToAsk"
                value="specific-dish"
                checked={form.whatToAsk === 'specific-dish'}
                onChange={() => update('whatToAsk', 'specific-dish')}
                className="accent-zinc-900"
              />
              Ask about a specific dish as well
            </label>
          </div>
        </div>

        {/* Specific dish — conditional */}
        {form.whatToAsk === 'specific-dish' && (
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="specificDish">
              Specific Dish
            </label>
            <input
              id="specificDish"
              type="text"
              placeholder="e.g. Pasta carbonara"
              value={form.specificDish}
              onChange={(e) => update('specificDish', e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            />
          </div>
        )}

        <button
          type="submit"
          disabled={isSearching}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 py-3 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
        >
          {isSearching ? (
            <>
              <LoadingSpinner size="sm" />
              Searching for restaurants…
            </>
          ) : (
            'Find restaurants and start calling'
          )}
        </button>
      </form>
    </div>
  );
}
