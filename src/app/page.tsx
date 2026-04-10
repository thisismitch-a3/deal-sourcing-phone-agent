'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { getRestaurants, upsertRestaurant, getLatestSession, deleteRestaurant } from '@/lib/storage';
import { DEFAULT_AGENT_SETTINGS } from '@/lib/utils';
import type { Restaurant, SearchSession, Voicemail, AgentSettings } from '@/lib/types';
import StatCard from '@/components/StatCard';
import RestaurantCard from '@/components/RestaurantCard';
import VoicemailCard from '@/components/VoicemailCard';
import CallOrchestrator, { type CallOrchestratorHandle } from '@/components/CallOrchestrator';
import TestCallPanel from '@/components/TestCallPanel';

export default function DashboardPage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [session, setSession] = useState<SearchSession | null>(null);
  const [voicemails, setVoicemails] = useState<Voicemail[]>([]);
  const [agentSettings, setAgentSettings] = useState<AgentSettings | null>(null);
  const [queuedIds, setQueuedIds] = useState<Set<string>>(new Set());
  const orchestratorRef = useRef<CallOrchestratorHandle>(null);

  // Load from localStorage + settings on mount
  useEffect(() => {
    const loadedRestaurants = getRestaurants();
    setRestaurants(loadedRestaurants);
    setSession(getLatestSession() ?? null);

    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        const merged: AgentSettings = { ...DEFAULT_AGENT_SETTINGS, ...data.settings };
        setAgentSettings(merged);
      })
      .catch(() => {
        setAgentSettings(DEFAULT_AGENT_SETTINGS);
      });
  }, []);

  // Auto-trigger menu research when settings load and there are pending restaurants
  useEffect(() => {
    if (!agentSettings) return;
    if (!agentSettings.menuResearchEnabled) return;
    const hasPending = restaurants.some((r) => r.callStatus === 'pending');
    if (hasPending) {
      orchestratorRef.current?.startResearch();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentSettings]);

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

  const handleRestaurantAdded = useCallback((restaurant: Restaurant) => {
    upsertRestaurant(restaurant);
    setRestaurants((prev) => [restaurant, ...prev]);
  }, []);

  function handleApproveAll() {
    const toApprove = restaurants.filter((r) => r.callStatus === 'awaiting-approval');
    toApprove.forEach((r) => {
      const updated: Restaurant = {
        ...r,
        callStatus: 'approved',
        suggestedDishes: r.suggestedDishes.map((d) => ({ ...d, approved: true })),
      };
      upsertRestaurant(updated);
      setRestaurants((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    });
  }

  function handleDelete(id: string) {
    deleteRestaurant(id);
    setRestaurants((prev) => prev.filter((r) => r.id !== id));
  }

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
  const callsPending = restaurants.filter((r) =>
    ['pending', 'researching', 'awaiting-approval', 'approved', 'calling'].includes(r.callStatus)
  ).length;
  const confirmed = restaurants.filter((r) => r.confirmed).length;
  const unreviewed = voicemails.filter((v) => !v.reviewed).length;
  const awaitingApproval = restaurants.filter((r) => r.callStatus === 'awaiting-approval');

  if (total === 0) {
    return (
      <div className="mx-auto max-w-lg space-y-8 py-16">
        <div className="text-center">
          <div className="mb-4 text-5xl">🍽️</div>
          <h1 className="text-2xl font-bold text-zinc-900">No searches yet</h1>
          <p className="mt-2 text-zinc-500">
            Start by searching for restaurants near you.
          </p>
          <Link
            href="/search"
            className="mt-6 inline-block rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
          >
            Start Your First Search
          </Link>
        </div>
        <TestCallPanel
          onRestaurantAdded={handleRestaurantAdded}
          onRestaurantUpdated={handleUpdate}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <CallOrchestrator
        ref={orchestratorRef}
        restaurants={restaurants}
        searchSession={session}
        agentSettings={agentSettings}
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

      {/* Approve All banner */}
      {awaitingApproval.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-800">
            <span className="font-semibold">{awaitingApproval.length}</span> restaurant{awaitingApproval.length === 1 ? '' : 's'} need dish approval before calling.
          </p>
          <button
            onClick={handleApproveAll}
            className="ml-4 shrink-0 rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 transition-colors"
          >
            Approve All
          </button>
        </div>
      )}

      {/* Restaurant cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {restaurants.map((r) => (
          <RestaurantCard
            key={r.id}
            restaurant={r}
            onStartCall={handleStartCall}
            onDelete={handleDelete}
            isCallQueued={queuedIds.has(r.id)}
          />
        ))}
      </div>

      {/* Test call panel */}
      <TestCallPanel
        onRestaurantAdded={handleRestaurantAdded}
        onRestaurantUpdated={handleUpdate}
      />

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
