'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getRestaurantById, upsertRestaurant } from '@/lib/storage';
import { formatRating, formatPhone, formatDate } from '@/lib/utils';
import type { Restaurant, CallStatusResponse } from '@/lib/types';
import StatusBadge from '@/components/StatusBadge';
import AudioPlayer from '@/components/AudioPlayer';
import ErrorMessage from '@/components/ErrorMessage';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function RestaurantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [restaurant, setRestaurant] = useState<Restaurant | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  // Load from localStorage
  useEffect(() => {
    const r = getRestaurantById(id);
    setRestaurant(r ?? null);
  }, [id]);

  // Auto-poll status while calling
  const handleStatusUpdate = useCallback(
    (updated: Restaurant) => {
      upsertRestaurant(updated);
      setRestaurant(updated);
    },
    []
  );

  useEffect(() => {
    if (!restaurant || restaurant.callStatus !== 'calling' || !restaurant.callId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/call/status?callId=${restaurant.callId}`);
        const data: CallStatusResponse = await res.json();

        if (data.status === 'complete') {
          // Summarise transcript
          let safeMenuOptions: string[] = [];
          if (data.transcript) {
            try {
              const sumRes = await fetch('/api/call/summarise', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  restaurantId: restaurant.id,
                  restaurantName: restaurant.name,
                  phone: restaurant.phone,
                  transcript: data.transcript,
                  dietaryRestrictions: 'No garlic, no soy — cross-contamination is fine',
                }),
              });
              const sumData = await sumRes.json();
              safeMenuOptions = sumData.safeMenuOptions ?? [];
            } catch {
              // non-fatal
            }
          }
          handleStatusUpdate({
            ...restaurant,
            callStatus: 'complete',
            transcript: data.transcript ?? null,
            recordingUrl: data.recordingUrl ?? null,
            safeMenuOptions,
          });
          clearInterval(interval);
        } else if (data.status === 'failed') {
          handleStatusUpdate({ ...restaurant, callStatus: 'failed' });
          clearInterval(interval);
        }
      } catch {
        // Silently retry
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [restaurant, handleStatusUpdate]);

  function markConfirmed() {
    if (!restaurant) return;
    const updated = { ...restaurant, confirmed: true, notSuitable: false };
    handleStatusUpdate(updated);
  }

  function markNotSuitable() {
    if (!restaurant) return;
    const updated = { ...restaurant, notSuitable: true, confirmed: false };
    handleStatusUpdate(updated);
  }

  async function retryCall() {
    if (!restaurant?.phone) return;
    setError(null);
    try {
      const res = await fetch('/api/call/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
          phone: restaurant.phone,
          address: restaurant.address,
          rating: restaurant.rating,
          dietaryRestrictions: 'No garlic, no soy — cross-contamination is fine',
          specificDish: '',
        }),
      });
      const data = await res.json();
      if (data.callId) {
        handleStatusUpdate({ ...restaurant, callStatus: 'calling', callId: data.callId });
      } else {
        setError(data.error ?? 'Failed to start call. Try again.');
      }
    } catch {
      setError('Failed to start call. Try again.');
    }
  }

  // Loading states
  if (restaurant === undefined) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner size="lg" label="Loading…" />
      </div>
    );
  }

  if (restaurant === null) {
    return (
      <div className="py-16 text-center">
        <p className="text-zinc-500">Restaurant not found.</p>
        <Link href="/" className="mt-4 inline-block text-sm font-medium text-zinc-900 underline">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  const r = restaurant;
  const callDone = r.callStatus === 'complete';
  const callFailed = r.callStatus === 'failed';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Back */}
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700">
        ← Dashboard
      </Link>

      <ErrorMessage message={error} onDismiss={() => setError(null)} />

      {/* Header card */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-zinc-900">{r.name}</h1>
            <p className="mt-1 text-sm text-zinc-500">{r.address}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-zinc-600">
              <span>{formatRating(r.rating)}</span>
              {r.phone && <span>{formatPhone(r.phone)}</span>}
              {!r.phone && <span className="italic text-zinc-400">No phone number</span>}
            </div>
            <p className="mt-1 text-xs text-zinc-400">Added {formatDate(r.createdAt)}</p>
          </div>
          <StatusBadge status={r.callStatus} className="shrink-0 mt-1" />
        </div>

        {r.callStatus === 'calling' && (
          <div className="mt-4 flex items-center gap-2 text-sm text-blue-600">
            <LoadingSpinner size="sm" />
            Call in progress — checking for updates…
          </div>
        )}
      </div>

      {/* Safe menu options */}
      {r.safeMenuOptions.length > 0 && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5">
          <h2 className="mb-3 font-semibold text-green-800">Safe Menu Options</h2>
          <ul className="space-y-1">
            {r.safeMenuOptions.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-green-700">
                <span className="mt-0.5 text-green-500">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {callDone && r.safeMenuOptions.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          No safe menu options were confirmed on this call.
        </div>
      )}

      {/* Recording */}
      {r.recordingUrl && (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold text-zinc-900">Call Recording</h2>
          <AudioPlayer url={r.recordingUrl} />
        </div>
      )}

      {/* Transcript */}
      {r.transcript && (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold text-zinc-900">Full Transcript</h2>
          <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap text-xs text-zinc-600 font-mono leading-relaxed">
            {r.transcript}
          </pre>
        </div>
      )}

      {/* Confirm / Not suitable */}
      {callDone && (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-semibold text-zinc-900">Your Decision</h2>
          {r.confirmed && (
            <p className="mb-3 text-sm text-green-700 font-medium">✓ You marked this restaurant as confirmed.</p>
          )}
          {r.notSuitable && (
            <p className="mb-3 text-sm text-red-700 font-medium">✕ You marked this as not suitable.</p>
          )}
          <div className="flex gap-3">
            <button
              onClick={markConfirmed}
              className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                r.confirmed
                  ? 'bg-green-600 text-white'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              ✓ Looks good — I&apos;ll eat here
            </button>
            <button
              onClick={markNotSuitable}
              className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                r.notSuitable
                  ? 'bg-red-600 text-white'
                  : 'bg-red-100 text-red-700 hover:bg-red-200'
              }`}
            >
              ✕ Not suitable
            </button>
          </div>
        </div>
      )}

      {/* Retry call */}
      {callFailed && r.phone && (
        <button
          onClick={retryCall}
          className="w-full rounded-lg border border-zinc-300 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
        >
          Retry Call
        </button>
      )}
    </div>
  );
}
