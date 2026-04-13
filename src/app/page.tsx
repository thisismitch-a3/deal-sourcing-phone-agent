'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { getBusinesses, upsertBusiness, getLatestSession, deleteBusiness } from '@/lib/storage';
import { DEFAULT_AGENT_SETTINGS } from '@/lib/utils';
import type { Business, SearchSession, Voicemail, AgentSettings } from '@/lib/types';
import StatCard from '@/components/StatCard';
import BusinessCard from '@/components/BusinessCard';
import VoicemailCard from '@/components/VoicemailCard';
import CallOrchestrator, { type CallOrchestratorHandle } from '@/components/CallOrchestrator';
import TestCallPanel from '@/components/TestCallPanel';

export default function DashboardPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [session, setSession] = useState<SearchSession | null>(null);
  const [voicemails, setVoicemails] = useState<Voicemail[]>([]);
  const [agentSettings, setAgentSettings] = useState<AgentSettings | null>(null);
  const [queuedIds, setQueuedIds] = useState<Set<string>>(new Set());
  const orchestratorRef = useRef<CallOrchestratorHandle>(null);

  // Load from localStorage + settings on mount
  useEffect(() => {
    setBusinesses(getBusinesses());
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

  const handleUpdate = useCallback((updated: Business) => {
    upsertBusiness(updated);
    setBusinesses((prev) =>
      prev.map((b) => (b.id === updated.id ? updated : b))
    );
  }, []);

  const handleBusinessAdded = useCallback((business: Business) => {
    upsertBusiness(business);
    setBusinesses((prev) => [business, ...prev]);
  }, []);

  function handleDelete(id: string) {
    deleteBusiness(id);
    setBusinesses((prev) => prev.filter((b) => b.id !== id));
  }

  function handleStartCall(id: string) {
    setQueuedIds((prev) => new Set(prev).add(id));
    const target = businesses.find((b) => b.id === id);
    if (!target) return;

    // Mark as approved so orchestrator picks it up
    const approved: Business = { ...target, callStatus: 'approved' };
    upsertBusiness(approved);
    setBusinesses((prev) => prev.map((b) => (b.id === id ? approved : b)));

    // Small delay to let state propagate, then start queue
    setTimeout(() => {
      orchestratorRef.current?.startQueue();
    }, 100);
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
  const total = businesses.length;
  const callsMade = businesses.filter((b) =>
    b.callStatus.startsWith('called-') || b.callStatus === 'callback-received'
  ).length;
  const interested = businesses.filter((b) =>
    b.callStatus === 'called-interested' || b.callStatus === 'callback-received'
  ).length;
  const maybeFollowUp = businesses.filter((b) =>
    b.callStatus === 'called-maybe' || b.callStatus === 'called-send-info'
  ).length;
  const unreviewed = voicemails.filter((v) => !v.reviewed).length;

  if (total === 0) {
    return (
      <div className="mx-auto max-w-lg space-y-8 py-16">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-zinc-900">No businesses yet</h1>
          <p className="mt-2 text-zinc-500">
            Start by searching for businesses or uploading a CSV.
          </p>
          <Link
            href="/search"
            className="mt-6 inline-block rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
          >
            Find Businesses
          </Link>
        </div>
        <TestCallPanel
          onBusinessAdded={handleBusinessAdded}
          onBusinessUpdated={handleUpdate}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <CallOrchestrator
        ref={orchestratorRef}
        businesses={businesses}
        agentSettings={agentSettings}
        onUpdate={handleUpdate}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Businesses Found" value={total} />
        <StatCard label="Calls Made" value={callsMade} colour="blue" />
        <StatCard label="Interested" value={interested} colour="green" />
        <StatCard label="Maybe / Follow-up" value={maybeFollowUp} colour="amber" />
      </div>

      {/* Last search context */}
      {session && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-500">
            Showing results for <span className="font-medium text-zinc-700">{session.location}</span>
            {session.businessType && (
              <> &middot; <span className="font-medium text-zinc-700">{session.businessType}</span></>
            )}
          </p>
          <Link
            href="/search"
            className="text-sm font-medium text-zinc-900 underline underline-offset-2 hover:text-zinc-600"
          >
            New search
          </Link>
        </div>
      )}

      {/* Business cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {businesses.map((b) => (
          <BusinessCard
            key={b.id}
            business={b}
            onStartCall={handleStartCall}
            onDelete={handleDelete}
            isCallQueued={queuedIds.has(b.id)}
          />
        ))}
      </div>

      {/* Test call panel */}
      <TestCallPanel
        onBusinessAdded={handleBusinessAdded}
        onBusinessUpdated={handleUpdate}
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
