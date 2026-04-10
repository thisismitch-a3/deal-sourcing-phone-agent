'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { upsertRestaurant } from '@/lib/storage';
import { generateId, formatRating } from '@/lib/utils';
import type {
  Restaurant,
  CallStartResponse,
  CallStatusResponse,
  SummariseResponse,
  PlaceSuggestion,
  SuggestedDish,
  MenuResearchResponse,
} from '@/lib/types';
import ErrorMessage from './ErrorMessage';
import LoadingSpinner from './LoadingSpinner';

interface TestCallPanelProps {
  onRestaurantAdded: (restaurant: Restaurant) => void;
  onRestaurantUpdated: (restaurant: Restaurant) => void;
}

const DEFAULT_RESTRICTIONS = 'No garlic, no soy — cross-contamination is fine';

function ConfidenceBadge({ confidence }: { confidence: SuggestedDish['confidence'] }) {
  const cls =
    confidence === 'high'
      ? 'bg-green-100 text-green-700'
      : confidence === 'medium'
      ? 'bg-amber-100 text-amber-700'
      : 'bg-zinc-100 text-zinc-600';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {confidence}
    </span>
  );
}

export default function TestCallPanel({ onRestaurantAdded, onRestaurantUpdated }: TestCallPanelProps) {
  const [open, setOpen] = useState(false);

  // Core fields
  const [phone, setPhone] = useState('');
  const [dietaryRestrictions, setDietaryRestrictions] = useState(DEFAULT_RESTRICTIONS);
  const [specificDish, setSpecificDish] = useState('');

  // Restaurant autocomplete
  const [nameQuery, setNameQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<PlaceSuggestion | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // Menu research
  const [testDishes, setTestDishes] = useState<SuggestedDish[]>([]);
  const [isResearching, setIsResearching] = useState(false);
  const [researchDone, setResearchDone] = useState(false);
  const [researchFailReason, setResearchFailReason] = useState<string | null>(null);

  // Call state
  const [isCalling, setIsCalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset highlight when suggestions list changes
  useEffect(() => {
    setHighlightedIndex(-1);
    itemRefs.current = [];
  }, [suggestions]);

  // Debounced place search
  const searchPlaces = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setIsSearchingPlaces(true);
      try {
        const res = await fetch(`/api/places/autocomplete?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setSuggestions(data.places ?? []);
        setShowDropdown((data.places ?? []).length > 0);
      } catch {
        setSuggestions([]);
      } finally {
        setIsSearchingPlaces(false);
      }
    }, 350);
  }, []);

  function handleNameChange(value: string) {
    setNameQuery(value);
    // Clear selected place if the user is editing the name manually
    if (selectedPlace && value !== selectedPlace.name) {
      setSelectedPlace(null);
      setTestDishes([]);
      setResearchDone(false);
    }
    searchPlaces(value);
  }

  async function runMenuResearch(place: PlaceSuggestion, restrictions: string) {
    setIsResearching(true);
    setTestDishes([]);
    setResearchDone(false);
    setResearchFailReason(null);
    try {
      const res = await fetch('/api/menu/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: `test-${place.placeId}`,
          restaurantName: place.name,
          address: place.address,
          placeId: place.placeId,
          dietaryRestrictions: restrictions,
          specificDish: '',
        }),
      });
      const data: MenuResearchResponse = await res.json();
      if (data.status === 'complete' && data.suggestedDishes.length > 0) {
        // Auto-approve all dishes to start
        setTestDishes(data.suggestedDishes.map((d) => ({ ...d, approved: true })));
      } else {
        setResearchFailReason(data.error ?? 'No menu content found online.');
      }
    } catch (err) {
      setResearchFailReason(err instanceof Error ? err.message : 'Menu research request failed.');
    } finally {
      setIsResearching(false);
      setResearchDone(true);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(highlightedIndex + 1, suggestions.length - 1);
      setHighlightedIndex(next);
      itemRefs.current[next]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = Math.max(highlightedIndex - 1, 0);
      setHighlightedIndex(prev);
      itemRefs.current[prev]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
        handleSelectPlace(suggestions[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
      setHighlightedIndex(-1);
    }
  }

  function handleSelectPlace(place: PlaceSuggestion) {
    setSelectedPlace(place);
    setNameQuery(place.name);
    setSuggestions([]);
    setShowDropdown(false);
    runMenuResearch(place, dietaryRestrictions);
  }

  function handleClearPlace() {
    setSelectedPlace(null);
    setNameQuery('');
    setTestDishes([]);
    setResearchDone(false);
    setSuggestions([]);
  }

  function toggleDish(id: string) {
    setTestDishes((prev) =>
      prev.map((d) => (d.id === id ? { ...d, approved: !d.approved } : d))
    );
  }

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const handleTestCall = useCallback(async () => {
    setError(null);
    setStatusMessage(null);

    if (!phone.trim()) {
      setError('Please enter a phone number.');
      return;
    }

    setIsCalling(true);
    setStatusMessage('Starting call…');

    const restaurantName = selectedPlace?.name || nameQuery.trim() || 'Test Restaurant';
    const address = selectedPlace?.address ?? 'Test call — no address';
    const rating = selectedPlace?.rating ?? null;
    const placeId = selectedPlace?.placeId ?? `test-${Date.now()}`;
    const approvedDishes = testDishes.filter((d) => d.approved);

    const restaurant: Restaurant = {
      id: generateId(),
      searchSessionId: 'test',
      createdAt: new Date().toISOString(),
      name: restaurantName,
      address,
      rating,
      phone: phone.trim(),
      placeId,
      callId: null,
      callStatus: 'calling',
      transcript: null,
      recordingUrl: null,
      safeMenuOptions: [],
      suggestedDishes: testDishes,
      confirmed: false,
      notSuitable: false,
    };

    upsertRestaurant(restaurant);
    onRestaurantAdded(restaurant);

    try {
      const res = await fetch('/api/call/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
          phone: restaurant.phone,
          address: restaurant.address,
          rating,
          dietaryRestrictions,
          specificDish,
          approvedDishes,
        }),
      });

      const startData: CallStartResponse = await res.json();

      if (!startData.callId) {
        throw new Error(startData.error ?? 'Failed to start call — no call ID returned.');
      }

      const withCallId: Restaurant = { ...restaurant, callId: startData.callId };
      upsertRestaurant(withCallId);
      onRestaurantUpdated(withCallId);
      setStatusMessage('Call in progress — waiting for it to end…');

      let failCount = 0;
      pollingRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/call/status?callId=${startData.callId}`);
          const statusData: CallStatusResponse = await statusRes.json();

          if (statusData.status === 'complete') {
            stopPolling();
            setStatusMessage('Call ended — extracting menu options…');

            let safeMenuOptions: string[] = [];
            if (statusData.transcript) {
              try {
                const sumRes = await fetch('/api/call/summarise', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    restaurantId: withCallId.id,
                    restaurantName: withCallId.name,
                    phone: withCallId.phone,
                    transcript: statusData.transcript,
                    dietaryRestrictions,
                  }),
                });
                const sumData: SummariseResponse = await sumRes.json();
                safeMenuOptions = sumData.safeMenuOptions ?? [];
              } catch {
                // non-fatal
              }
            }

            const completed: Restaurant = {
              ...withCallId,
              callStatus: 'complete',
              transcript: statusData.transcript ?? null,
              recordingUrl: statusData.recordingUrl ?? null,
              safeMenuOptions,
            };

            upsertRestaurant(completed);
            onRestaurantUpdated(completed);
            setStatusMessage(null);
            setIsCalling(false);
            // Reset form for next test
            setPhone('');
            setSpecificDish('');
            setSelectedPlace(null);
            setNameQuery('');
            setTestDishes([]);
            setResearchDone(false);
          } else if (statusData.status === 'failed') {
            stopPolling();
            const reason = statusData.error ?? statusData.endedReason ?? 'Call failed.';
            const failed: Restaurant = { ...withCallId, callStatus: 'failed', callError: reason };
            upsertRestaurant(failed);
            onRestaurantUpdated(failed);
            setError(reason);
            setStatusMessage(null);
            setIsCalling(false);
          }
        } catch {
          failCount++;
          if (failCount >= 5) {
            stopPolling();
            const failed: Restaurant = { ...withCallId, callStatus: 'failed', callError: 'Lost contact with Vapi after 5 retries.' };
            upsertRestaurant(failed);
            onRestaurantUpdated(failed);
            setError('Lost contact with Vapi after 5 retries.');
            setStatusMessage(null);
            setIsCalling(false);
          }
        }
      }, 5000);

    } catch (err) {
      stopPolling();
      const failed: Restaurant = { ...restaurant, callStatus: 'failed', callError: err instanceof Error ? err.message : 'Something went wrong.' };
      upsertRestaurant(failed);
      onRestaurantUpdated(failed);
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setStatusMessage(null);
      setIsCalling(false);
    }
  }, [phone, nameQuery, selectedPlace, dietaryRestrictions, specificDish, testDishes, onRestaurantAdded, onRestaurantUpdated, stopPolling]);

  const inputCls = 'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50';

  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white">
      {/* Toggle header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-zinc-700">Test Call</span>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
            Dev tool
          </span>
        </div>
        <span className="text-zinc-400 text-sm">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-zinc-100 px-5 py-4 space-y-4">
          <p className="text-xs text-zinc-500">
            Search for a real restaurant to research its menu, then call any number to test the voice agent with those dishes.
          </p>

          <ErrorMessage message={error} onDismiss={() => setError(null)} />

          {statusMessage && (
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <LoadingSpinner size="sm" />
              {statusMessage}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {/* Phone number */}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600" htmlFor="test-phone">
                Phone Number to Call <span className="text-red-500">*</span>
              </label>
              <input
                id="test-phone"
                type="tel"
                placeholder="+16135551234"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={isCalling}
                className={inputCls}
              />
            </div>

            {/* Restaurant name with autocomplete */}
            <div className="relative" ref={dropdownRef}>
              <label className="mb-1 block text-xs font-medium text-zinc-600" htmlFor="test-name">
                Restaurant
              </label>

              {selectedPlace ? (
                /* Selected place chip */
                <div className="flex items-center gap-2 rounded-lg border border-teal-300 bg-teal-50 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 truncate">{selectedPlace.name}</p>
                    <p className="text-xs text-zinc-500 truncate">{selectedPlace.address}</p>
                  </div>
                  <button
                    onClick={handleClearPlace}
                    disabled={isCalling}
                    className="shrink-0 text-zinc-400 hover:text-zinc-600 disabled:opacity-50"
                    aria-label="Clear selection"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                /* Search input */
                <div className="relative">
                  <input
                    id="test-name"
                    type="text"
                    placeholder="Search for a restaurant…"
                    value={nameQuery}
                    onChange={(e) => handleNameChange(e.target.value)}
                    onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
                    onKeyDown={handleKeyDown}
                    disabled={isCalling}
                    className={inputCls}
                    autoComplete="off"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={showDropdown}
                  />
                  {isSearchingPlaces && (
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                      <LoadingSpinner size="sm" />
                    </div>
                  )}
                </div>
              )}

              {/* Dropdown */}
              {showDropdown && suggestions.length > 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-lg border border-zinc-200 bg-white shadow-lg overflow-hidden max-h-64 overflow-y-auto" role="listbox">
                  {suggestions.map((place, idx) => (
                    <button
                      key={place.placeId}
                      ref={(el) => { itemRefs.current[idx] = el; }}
                      role="option"
                      aria-selected={idx === highlightedIndex}
                      onMouseDown={(e) => {
                        e.preventDefault(); // prevent input blur before click
                        handleSelectPlace(place);
                      }}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors border-b border-zinc-100 last:border-0 ${
                        idx === highlightedIndex ? 'bg-zinc-100' : 'hover:bg-zinc-50'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-900 truncate">{place.name}</p>
                        <p className="text-xs text-zinc-500 truncate">{place.address}</p>
                      </div>
                      {place.rating !== null && (
                        <span className="shrink-0 text-xs text-zinc-500 mt-0.5">
                          {formatRating(place.rating)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Menu research results */}
          {selectedPlace && (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-zinc-600">Menu Research</p>
                {isResearching && <LoadingSpinner size="sm" />}
              </div>

              {isResearching && (
                <p className="text-xs text-zinc-500">Looking up menu online…</p>
              )}

              {!isResearching && researchDone && testDishes.length === 0 && (
                <p className="text-xs text-zinc-500">
                  No menu found — agent will ask general dietary questions.
                  {researchFailReason && (
                    <span className="block mt-0.5 text-amber-600">{researchFailReason}</span>
                  )}
                </p>
              )}

              {!isResearching && testDishes.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-zinc-500">
                    Toggle dishes to include in the call. Approved dishes are injected into the agent&apos;s prompt.
                  </p>
                  {testDishes.map((dish) => (
                    <div
                      key={dish.id}
                      className={`flex items-start gap-2 rounded-md border px-2.5 py-2 transition-colors ${
                        dish.approved ? 'border-green-200 bg-white' : 'border-zinc-200 bg-zinc-100'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-xs font-medium ${dish.approved ? 'text-zinc-900' : 'text-zinc-400 line-through'}`}>
                            {dish.name}
                          </span>
                          <ConfidenceBadge confidence={dish.confidence} />
                        </div>
                      </div>
                      <button
                        onClick={() => toggleDish(dish.id)}
                        disabled={isCalling}
                        className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                          dish.approved
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-zinc-200 text-zinc-500 hover:bg-zinc-300'
                        }`}
                      >
                        {dish.approved ? '✓' : '✕'}
                      </button>
                    </div>
                  ))}
                  <p className="text-xs text-zinc-400">
                    {testDishes.filter((d) => d.approved).length} of {testDishes.length} dishes approved
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Dietary restrictions */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600" htmlFor="test-restrictions">
              Dietary Restrictions
            </label>
            <input
              id="test-restrictions"
              type="text"
              value={dietaryRestrictions}
              onChange={(e) => setDietaryRestrictions(e.target.value)}
              disabled={isCalling}
              className={inputCls}
            />
          </div>

          {/* Specific dish */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600" htmlFor="test-dish">
              Specific Dish <span className="text-zinc-400 font-normal">(optional)</span>
            </label>
            <input
              id="test-dish"
              type="text"
              placeholder="e.g. Pasta carbonara"
              value={specificDish}
              onChange={(e) => setSpecificDish(e.target.value)}
              disabled={isCalling}
              className={inputCls}
            />
          </div>

          <button
            onClick={handleTestCall}
            disabled={isCalling || !phone.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-800 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-40 transition-colors"
          >
            {isCalling ? (
              <>
                <LoadingSpinner size="sm" />
                Calling…
              </>
            ) : (
              'Start Test Call'
            )}
          </button>
        </div>
      )}
    </div>
  );
}
