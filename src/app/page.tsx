'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { getRestaurants, upsertRestaurant, getLatestSession } from '@/lib/storage';
import type { Restaurant, SearchSession, Voicemail } from '@/lib/types';
import StatCard from '@/components/StatCard';
import RestaurantCard from '@/components/RestaurantCard';
import VoicemailCard from '@/components/VoicemailCard';
import CallOrchestrator, { type CallOrchestratorHandle } from '@/components/CallOrchestrator';

export default function DashboardPage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [session, setSession] = useState<SearchSession | null>(null);
  const [voicemails, setVoicemails] = useState<Voicemail[]>([]);
  const [queuedIds, setQueuedIds] = useState<Set<string>>(new Set());
  const orchestratorRef = useRef<CallOrchestratorHandle>(null);

  // Load from localStorage on mount
  useEffect(() => {
    setRestaurants(getRestaurants());
    setSession(getLatestSession() ?? null);
  }, []);

  // Poll for voicemails every 30s
  useEffect(() => {
    function fetchVoicemails() {
      fetch('/api/inbound/voicemails')
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data.voicemails)) setVoicemails(data.voicemails);
        })
        .catch(() => {/* silently ignore — KV may not be configured yet */});
    }
    fetchVoicemails();
    const interval = setInterval(fetchVoicemails, 30_000);
    return () => clearInterval(interval);
  }, []);

  const handleUpdate = useCallback((updated: Restaurant) => {
    upsertRestaurant(updated);
    setRestaurants((prev) =>
      prev.map((r) => (r.id === updated.id ? updated : r))
    );
  }, []);

  function handleStartCall(id: string) {
    setQueuedIds((prev) => new Set(prev).add(id));
    // Mark this single restaurant as the queue and fire
    const target = restaurants.find((r) => r.id === id);
    if (!target) return;
    orchestratorRef.current?.startQueue();
  }

  async function handleMarkVoicemailReviewed(id: string) {
    await fetch('/api/inbound/voicemails', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setVoicemails((prev) =>
      prev.map((v) => (v.id === id ? { ...v, reviewed: true } : v))
    );
  }

  // Stats
  const total = restaurants.length;
  const callsComplete = restaurants.filter((r) => r.callStatus === 'complete').length;
  const callsPending = restaurants.filter(
    (r) => r.callStatus === 'pending' || r.callStatus === 'calling'
  ).length;
  const confirmed = restaurants.filter((r) => r.confirmed).length;
  const unreviewed = voicemails.filter((v) => !v.reviewed).length;

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-6 text-5xl">🍽️</div>
        <h1 className="text-2xl font-bold text-zinc-900">No searches yet</h1>
        <p className="mt-2 text-zinc-500">
          Start by searching for restaurants near you.
        </p>
        <Link
          href="/search"
          className="mt-6 rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
        >
          Start Your First Search
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <CallOrchestrator
        ref={orchestratorRef}
        restaurants={restaurants}
        searchSession={session}
        onUpdate={handleUpdate}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Restaurants Found" value={total} />
        <StatCard label="Calls Complete" value={callsComplete} colour="blue" />
        <StatCard label="Pending / Calling" value={callsPending} colour="amber" />
        <StatCard label="Confirmed" value={confirmed} colour="green" />
      </div>

      {/* Last search context */}
      {session && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-500">
            Showing results for <span className="font-medium text-zinc-700">{session.location}</span>
          </p>
          <Link
            href="/search"
            className="text-sm font-medium text-zinc-900 underline underline-offset-2 hover:text-zinc-600"
          >
            New search
          </Link>
        </div>
      )}

      {/* Restaurant cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {restaurants.map((r) => (
          <RestaurantCard
            key={r.id}
            restaurant={r}
            onStartCall={handleStartCall}
            isCallQueued={queuedIds.has(r.id)}
          />
        ))}
      </div>

      {/* Voicemails section */}
      {voicemails.length > 0 && (
        <section>
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-lg font-semibold text-zinc-900">Missed Callbacks</h2>
            {unreviewed > 0 && (
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                {unreviewed} new
              </span>
            )}
          </div>
          <div className="space-y-3">
            {voicemails.map((vm) => (
              <VoicemailCard
                key={vm.id}
                voicemail={vm}
                onMarkReviewed={handleMarkVoicemailReviewed}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
