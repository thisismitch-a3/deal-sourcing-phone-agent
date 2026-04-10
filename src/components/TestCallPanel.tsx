'use client';

import { useState, useRef, useCallback } from 'react';
import { upsertRestaurant } from '@/lib/storage';
import { generateId, delay } from '@/lib/utils';
import type { Restaurant, CallStartResponse, CallStatusResponse, SummariseResponse } from '@/lib/types';
import ErrorMessage from './ErrorMessage';
import LoadingSpinner from './LoadingSpinner';

interface TestCallPanelProps {
  onRestaurantAdded: (restaurant: Restaurant) => void;
  onRestaurantUpdated: (restaurant: Restaurant) => void;
}

const DEFAULT_RESTRICTIONS = 'No garlic, no soy — cross-contamination is fine';

export default function TestCallPanel({ onRestaurantAdded, onRestaurantUpdated }: TestCallPanelProps) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [restaurantName, setRestaurantName] = useState('Test Restaurant');
  const [dietaryRestrictions, setDietaryRestrictions] = useState(DEFAULT_RESTRICTIONS);
  const [specificDish, setSpecificDish] = useState('');
  const [isCalling, setIsCalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

    // Create a mock restaurant entry
    const restaurant: Restaurant = {
      id: generateId(),
      searchSessionId: 'test',
      createdAt: new Date().toISOString(),
      name: restaurantName.trim() || 'Test Restaurant',
      address: 'Test call — no address',
      rating: null,
      phone: phone.trim(),
      placeId: `test-${Date.now()}`,
      callId: null,
      callStatus: 'calling',
      transcript: null,
      recordingUrl: null,
      safeMenuOptions: [],
      suggestedDishes: [],
      confirmed: false,
      notSuitable: false,
    };

    upsertRestaurant(restaurant);
    onRestaurantAdded(restaurant);

    try {
      // Initiate the call
      const res = await fetch('/api/call/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
          phone: restaurant.phone,
          address: restaurant.address,
          rating: null,
          dietaryRestrictions,
          specificDish,
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

      // Poll for completion
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
            const failed: Restaurant = { ...withCallId, callStatus: 'failed' };
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
      const failed: Restaurant = { ...restaurant, callStatus: 'failed' };
      upsertRestaurant(failed);
      onRestaurantUpdated(failed);
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setStatusMessage(null);
      setIsCalling(false);
    }
  }, [phone, restaurantName, dietaryRestrictions, specificDish, onRestaurantAdded, onRestaurantUpdated, stopPolling]);

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
            Call any number directly to test the voice agent. Results appear as a card on the dashboard.
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
                Phone Number <span className="text-red-500">*</span>
              </label>
              <input
                id="test-phone"
                type="tel"
                placeholder="+16135551234"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={isCalling}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
              />
            </div>

            {/* Restaurant name */}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600" htmlFor="test-name">
                Restaurant Name
              </label>
              <input
                id="test-name"
                type="text"
                placeholder="Test Restaurant"
                value={restaurantName}
                onChange={(e) => setRestaurantName(e.target.value)}
                disabled={isCalling}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
              />
            </div>
          </div>

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
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
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
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
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
