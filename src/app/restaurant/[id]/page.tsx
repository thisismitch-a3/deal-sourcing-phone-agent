'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getRestaurantById, upsertRestaurant, getSessions } from '@/lib/storage';
import { formatRating, formatPhone, formatDate, generateId } from '@/lib/utils';
import type { Restaurant, SearchSession, CallStatusResponse, SuggestedDish, CallStatus, MenuResearchResponse } from '@/lib/types';
import StatusBadge from '@/components/StatusBadge';
import AudioPlayer from '@/components/AudioPlayer';
import ErrorMessage from '@/components/ErrorMessage';
import LoadingSpinner from '@/components/LoadingSpinner';

// ─── Inline sub-components ────────────────────────────────────────────────────

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

function AddCustomDish({ onAdd }: { onAdd: (name: string) => void }) {
  const [value, setValue] = useState('');
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setValue('');
  }
  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add a custom dish…"
        className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 transition-colors"
      >
        Add
      </button>
    </form>
  );
}

export default function RestaurantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [restaurant, setRestaurant] = useState<Restaurant | null | undefined>(undefined);
  const [session, setSession] = useState<SearchSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load restaurant + its parent session from localStorage
  useEffect(() => {
    const r = getRestaurantById(id);
    setRestaurant(r ?? null);
    if (r) {
      const s = getSessions().find((s) => s.id === r.searchSessionId) ?? null;
      setSession(s);
    }
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
          // Summarise transcript using the actual session restrictions
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
                  dietaryRestrictions: session?.dietaryRestrictions ?? 'no garlic, no soy',
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
  }, [restaurant, session, handleStatusUpdate]);

  // ── Menu research handlers ────────────────────────────────────────────────

  function toggleDish(dishId: string) {
    if (!restaurant) return;
    const updated: Restaurant = {
      ...restaurant,
      suggestedDishes: restaurant.suggestedDishes.map((d) =>
        d.id === dishId ? { ...d, approved: !d.approved } : d
      ),
    };
    handleStatusUpdate(updated);
  }

  function handleApproveAndSchedule() {
    if (!restaurant) return;
    const updated: Restaurant = { ...restaurant, callStatus: 'approved' as CallStatus };
    handleStatusUpdate(updated);
  }

  function handleCallAnyway() {
    if (!restaurant) return;
    const updated: Restaurant = {
      ...restaurant,
      callStatus: 'pending' as CallStatus,
      suggestedDishes: [],
    };
    handleStatusUpdate(updated);
  }

  function handleAddDish(name: string) {
    if (!restaurant) return;
    const newDish: SuggestedDish = {
      id: generateId(),
      name,
      confidence: 'high',
      reasoning: 'Added manually.',
      approved: true,
    };
    const updated: Restaurant = {
      ...restaurant,
      suggestedDishes: [...restaurant.suggestedDishes, newDish],
    };
    handleStatusUpdate(updated);
  }

  async function handleRegenerateResearch() {
    if (!restaurant) return;
    const researching: Restaurant = {
      ...restaurant,
      callStatus: 'researching' as CallStatus,
      suggestedDishes: [],
    };
    handleStatusUpdate(researching);
    try {
      const res = await fetch('/api/menu/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
          address: restaurant.address,
          placeId: restaurant.placeId,
          dietaryRestrictions: session?.dietaryRestrictions ?? '',
          specificDish: session?.specificDish ?? '',
        }),
      });
      const data: MenuResearchResponse = await res.json();
      const updated: Restaurant = {
        ...restaurant,
        callStatus: (data.status === 'complete' && data.suggestedDishes.length > 0 ? 'awaiting-approval' : 'no-menu') as CallStatus,
        suggestedDishes: data.suggestedDishes ?? [],
      };
      handleStatusUpdate(updated);
    } catch {
      handleStatusUpdate({ ...restaurant, callStatus: 'no-menu' as CallStatus, suggestedDishes: [] });
    }
  }

  // ── Call handlers ─────────────────────────────────────────────────────────

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
          dietaryRestrictions: session?.dietaryRestrictions ?? 'no garlic, no soy',
          specificDish: session?.specificDish ?? '',
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

      {/* Menu research section */}
      {r.callStatus === 'researching' && (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <LoadingSpinner size="sm" />
            <span className="text-sm text-zinc-600">Researching menu online…</span>
          </div>
        </div>
      )}

      {r.callStatus === 'awaiting-approval' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-amber-900">Review Suggested Dishes</h2>
            <button
              onClick={handleRegenerateResearch}
              className="text-xs text-amber-700 underline hover:text-amber-900"
            >
              Regenerate
            </button>
          </div>
          <p className="text-sm text-amber-800">
            Approve the dishes you&apos;d like the agent to ask about. Dishes you approve will be injected into the call.
          </p>

          <div className="space-y-2">
            {r.suggestedDishes.map((dish) => (
              <div
                key={dish.id}
                className={`rounded-lg border p-3 flex items-start justify-between gap-3 transition-colors ${
                  dish.approved
                    ? 'border-green-300 bg-green-50'
                    : 'border-amber-200 bg-white'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-zinc-900">{dish.name}</span>
                    <ConfidenceBadge confidence={dish.confidence} />
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500 leading-relaxed">{dish.reasoning}</p>
                </div>
                <button
                  onClick={() => toggleDish(dish.id)}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    dish.approved
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                  }`}
                >
                  {dish.approved ? '✓ Approved' : 'Approve'}
                </button>
              </div>
            ))}
          </div>

          <AddCustomDish onAdd={handleAddDish} />

          <button
            onClick={handleApproveAndSchedule}
            disabled={r.suggestedDishes.filter((d) => d.approved).length === 0}
            className="w-full rounded-lg bg-zinc-900 py-3 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
          >
            Approve Selected &amp; Schedule Call
            {r.suggestedDishes.filter((d) => d.approved).length > 0 && (
              <span className="ml-1 opacity-75">
                ({r.suggestedDishes.filter((d) => d.approved).length} dish{r.suggestedDishes.filter((d) => d.approved).length === 1 ? '' : 'es'})
              </span>
            )}
          </button>
        </div>
      )}

      {r.callStatus === 'approved' && r.suggestedDishes.filter((d) => d.approved).length > 0 && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-5">
          <h2 className="mb-3 font-semibold text-teal-800">Approved Dishes for Call</h2>
          <ul className="space-y-1">
            {r.suggestedDishes.filter((d) => d.approved).map((dish) => (
              <li key={dish.id} className="flex items-start gap-2 text-sm text-teal-700">
                <span className="mt-0.5 text-teal-500">✓</span>
                <span>{dish.name}</span>
                <ConfidenceBadge confidence={dish.confidence} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.callStatus === 'no-menu' && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-sm text-zinc-600">No menu found online for this restaurant.</p>
          <button
            onClick={handleCallAnyway}
            className="mt-2 text-sm font-medium text-zinc-900 underline hover:text-zinc-600"
          >
            Call anyway (general dietary inquiry)
          </button>
        </div>
      )}

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
