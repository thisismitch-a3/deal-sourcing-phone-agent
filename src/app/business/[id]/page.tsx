'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getBusinessById, upsertBusiness } from '@/lib/storage';
import { formatPhone, formatDate } from '@/lib/utils';
import type {
  Business,
  CallStatus,
  CallStatusResponse,
  AnalyseCallResponse,
  CallOutcome,
} from '@/lib/types';
import StatusBadge from '@/components/StatusBadge';
import AudioPlayer from '@/components/AudioPlayer';
import ErrorMessage from '@/components/ErrorMessage';
import LoadingSpinner from '@/components/LoadingSpinner';

const OUTCOME_TO_STATUS: Record<CallOutcome, CallStatus> = {
  'interested': 'called-interested',
  'maybe': 'called-maybe',
  'not-interested': 'called-not-interested',
  'wrong-contact': 'called-wrong-contact',
  'send-info': 'called-send-info',
  'left-voicemail': 'called-left-voicemail',
  'no-answer': 'called-no-answer',
};

export default function BusinessDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [business, setBusiness] = useState<Business | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    companyName: '',
    contactName: '',
    phone: '',
    email: '',
    city: '',
    industry: '',
    description: '',
    researchNotes: '',
    talkingPoints: '',
    notes: '',
  });

  useEffect(() => {
    const b = getBusinessById(id);
    setBusiness(b ?? null);
    if (b) {
      setEditForm({
        companyName: b.companyName,
        contactName: b.contactName,
        phone: b.phone ?? '',
        email: b.email,
        city: b.city,
        industry: b.industry,
        description: b.description,
        researchNotes: b.researchNotes,
        talkingPoints: b.talkingPoints,
        notes: b.notes,
      });
    }
  }, [id]);

  const persist = useCallback((updated: Business) => {
    upsertBusiness(updated);
    setBusiness(updated);
  }, []);

  // Auto-poll status while calling
  useEffect(() => {
    if (!business || business.callStatus !== 'calling' || !business.callId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/call/status?callId=${business.callId}`);
        const data: CallStatusResponse = await res.json();

        if (data.status && data.status !== 'calling') {
          clearInterval(interval);

          let finalStatus: CallStatus = data.status;
          let notes = '';

          if (data.transcript && !['called-left-voicemail', 'called-no-answer', 'failed'].includes(data.status)) {
            try {
              const sumRes = await fetch('/api/call/summarise', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  businessId: business.id,
                  companyName: business.companyName,
                  contactName: business.contactName,
                  phone: business.phone,
                  transcript: data.transcript,
                }),
              });
              const sumData: AnalyseCallResponse = await sumRes.json();
              finalStatus = OUTCOME_TO_STATUS[sumData.outcome] ?? 'called-maybe';
              notes = sumData.notes || '';
            } catch {
              // non-fatal
            }
          }

          const historyEntry = {
            callId: business.callId || '',
            timestamp: new Date().toISOString(),
            outcome: finalStatus,
            transcript: data.transcript ?? null,
            recordingUrl: data.recordingUrl ?? null,
            duration: null,
            notes,
          };

          persist({
            ...business,
            callStatus: finalStatus,
            transcript: data.transcript ?? null,
            recordingUrl: data.recordingUrl ?? null,
            callHistory: [...business.callHistory, historyEntry],
          });
        }
      } catch {
        // silently retry
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [business, persist]);

  function handleSaveEdit() {
    if (!business) return;
    const updated: Business = {
      ...business,
      companyName: editForm.companyName.trim() || business.companyName,
      contactName: editForm.contactName.trim(),
      phone: editForm.phone.trim() || null,
      email: editForm.email.trim(),
      city: editForm.city.trim(),
      industry: editForm.industry.trim(),
      description: editForm.description.trim(),
      researchNotes: editForm.researchNotes.trim(),
      talkingPoints: editForm.talkingPoints.trim(),
      notes: editForm.notes.trim(),
      callStatus: editForm.phone.trim() && business.callStatus === 'no-phone' ? 'pending' : business.callStatus,
    };
    persist(updated);
    setIsEditing(false);
  }

  function handleApprove() {
    if (!business) return;
    persist({ ...business, callStatus: 'approved' });
  }

  function handleSkip() {
    if (!business) return;
    persist({ ...business, callStatus: 'called-not-interested' });
  }

  async function handleCallNow() {
    if (!business?.phone) return;
    setError(null);

    persist({ ...business, callStatus: 'calling' });

    try {
      const res = await fetch('/api/call/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: business.id,
          companyName: business.companyName,
          contactName: business.contactName,
          phone: business.phone,
          city: business.city,
          industry: business.industry,
          description: business.description,
          researchNotes: business.researchNotes,
          talkingPoints: business.talkingPoints,
        }),
      });
      const data = await res.json();
      if (data.callId) {
        persist({ ...business, callStatus: 'calling', callId: data.callId });
      } else {
        persist({ ...business, callStatus: 'failed', callError: data.error ?? 'Failed to start call.' });
        setError(data.error ?? 'Failed to start call.');
      }
    } catch {
      persist({ ...business, callStatus: 'failed', callError: 'Failed to start call.' });
      setError('Failed to start call.');
    }
  }

  async function handleResearch() {
    if (!business) return;
    setError(null);
    persist({ ...business, callStatus: 'researched' });

    try {
      const res = await fetch('/api/business/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: business.id,
          companyName: business.companyName,
          address: business.city,
          placeId: business.placeId,
          industry: business.industry,
        }),
      });
      const data = await res.json();
      if (data.researchNotes) {
        const updated: Business = {
          ...business,
          callStatus: 'researched',
          researchNotes: data.researchNotes,
          talkingPoints: (data.suggestedTalkingPoints ?? []).join('\n'),
        };
        persist(updated);
        setEditForm((f) => ({
          ...f,
          researchNotes: updated.researchNotes,
          talkingPoints: updated.talkingPoints,
        }));
      }
    } catch {
      setError('Research failed. You can still proceed with the call.');
    }
  }

  // Loading states
  if (business === undefined) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner size="lg" label="Loading..." />
      </div>
    );
  }

  if (business === null) {
    return (
      <div className="py-16 text-center">
        <p className="text-zinc-500">Business not found.</p>
        <Link href="/" className="mt-4 inline-block text-sm font-medium text-zinc-900 underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const b = business;
  const canCall = ['pending', 'researched', 'approved'].includes(b.callStatus) && b.phone;
  const canRetry = b.callStatus === 'failed' && b.phone;

  const inputCls = 'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Back */}
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700">
        &larr; Dashboard
      </Link>

      <ErrorMessage message={error} onDismiss={() => setError(null)} />

      {/* Header card */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-zinc-900">{b.companyName}</h1>
            {b.contactName && (
              <p className="mt-0.5 text-sm text-zinc-600">{b.contactName}</p>
            )}
            <p className="mt-1 text-sm text-zinc-500">
              {[b.industry, b.city].filter(Boolean).join(' \u00B7 ')}
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-zinc-600">
              {b.phone ? (
                <span>{formatPhone(b.phone)}</span>
              ) : (
                <span className="italic text-zinc-400">No phone number</span>
              )}
              {b.email && <span>{b.email}</span>}
            </div>
            <p className="mt-1 text-xs text-zinc-400">Added {formatDate(b.createdAt)}</p>
          </div>
          <StatusBadge status={b.callStatus} className="shrink-0 mt-1" />
        </div>

        {b.callStatus === 'calling' && (
          <div className="mt-4 flex items-center gap-2 text-sm text-blue-600">
            <LoadingSpinner size="sm" />
            Call in progress -- checking for updates...
          </div>
        )}

        {b.callStatus === 'failed' && b.callError && (
          <p className="mt-3 text-sm text-red-600">{b.callError}</p>
        )}

        {b.emailSent && (
          <p className="mt-3 text-xs text-blue-600 font-medium">Follow-up email sent</p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        {b.callStatus === 'pending' && (
          <button
            onClick={handleResearch}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            Research Business
          </button>
        )}
        {(canCall || canRetry) && (
          <button
            onClick={handleCallNow}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
          >
            {canRetry ? 'Retry Call' : 'Call Now'}
          </button>
        )}
        {['pending', 'researched'].includes(b.callStatus) && (
          <button
            onClick={handleApprove}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 transition-colors"
          >
            Approve &amp; Queue
          </button>
        )}
        {['pending', 'researched', 'approved'].includes(b.callStatus) && (
          <button
            onClick={handleSkip}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            Skip
          </button>
        )}
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
        >
          {isEditing ? 'Cancel Edit' : 'Edit'}
        </button>
      </div>

      {/* Edit form */}
      {isEditing && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="font-semibold text-zinc-900">Edit Business</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Company Name</label>
              <input
                type="text"
                value={editForm.companyName}
                onChange={(e) => setEditForm((f) => ({ ...f, companyName: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Contact Name</label>
              <input
                type="text"
                value={editForm.contactName}
                onChange={(e) => setEditForm((f) => ({ ...f, contactName: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Phone</label>
              <input
                type="tel"
                value={editForm.phone}
                onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Email</label>
              <input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">City</label>
              <input
                type="text"
                value={editForm.city}
                onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Industry</label>
              <input
                type="text"
                value={editForm.industry}
                onChange={(e) => setEditForm((f) => ({ ...f, industry: e.target.value }))}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Description</label>
            <textarea
              rows={2}
              value={editForm.description}
              onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
              className={inputCls}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Research Notes</label>
            <textarea
              rows={4}
              value={editForm.researchNotes}
              onChange={(e) => setEditForm((f) => ({ ...f, researchNotes: e.target.value }))}
              className={inputCls}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Talking Points</label>
            <textarea
              rows={3}
              value={editForm.talkingPoints}
              onChange={(e) => setEditForm((f) => ({ ...f, talkingPoints: e.target.value }))}
              className={inputCls}
              placeholder="One per line..."
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Notes</label>
            <textarea
              rows={2}
              value={editForm.notes}
              onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
              className={inputCls}
            />
          </div>

          <button
            onClick={handleSaveEdit}
            className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 transition-colors"
          >
            Save Changes
          </button>
        </div>
      )}

      {/* Research notes (read-only when not editing) */}
      {!isEditing && b.researchNotes && (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold text-zinc-900">Pre-Call Research</h2>
          <pre className="whitespace-pre-wrap text-sm text-zinc-600 leading-relaxed font-sans">
            {b.researchNotes}
          </pre>
          {b.talkingPoints && (
            <>
              <h3 className="mt-4 mb-2 text-sm font-semibold text-zinc-800">Talking Points</h3>
              <pre className="whitespace-pre-wrap text-sm text-zinc-600 leading-relaxed font-sans">
                {b.talkingPoints}
              </pre>
            </>
          )}
        </div>
      )}

      {/* Description (read-only when not editing) */}
      {!isEditing && b.description && (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold text-zinc-900">Company Description</h2>
          <p className="text-sm text-zinc-600 leading-relaxed">{b.description}</p>
        </div>
      )}

      {/* Latest call recording */}
      {b.recordingUrl && (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold text-zinc-900">Latest Call Recording</h2>
          <AudioPlayer url={b.recordingUrl} />
        </div>
      )}

      {/* Latest transcript */}
      {b.transcript && (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold text-zinc-900">Latest Transcript</h2>
          <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap text-xs text-zinc-600 font-mono leading-relaxed">
            {b.transcript}
          </pre>
        </div>
      )}

      {/* Call History */}
      {b.callHistory.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-semibold text-zinc-900">Call History</h2>
          <div className="space-y-3">
            {b.callHistory.map((entry, i) => (
              <details key={i} className="rounded-lg border border-zinc-100 bg-zinc-50">
                <summary className="cursor-pointer px-4 py-3 text-sm">
                  <span className="font-medium text-zinc-800">
                    {formatDate(entry.timestamp)}
                  </span>
                  <span className="ml-2 text-zinc-500">
                    &mdash; {entry.outcome}
                  </span>
                  {entry.notes && (
                    <span className="ml-2 text-zinc-400 text-xs">
                      ({entry.notes.slice(0, 60)}{entry.notes.length > 60 ? '...' : ''})
                    </span>
                  )}
                </summary>
                <div className="border-t border-zinc-100 px-4 py-3 space-y-3">
                  {entry.notes && (
                    <div>
                      <p className="text-xs font-medium text-zinc-600 mb-1">Notes</p>
                      <p className="text-sm text-zinc-700">{entry.notes}</p>
                    </div>
                  )}
                  {entry.recordingUrl && (
                    <div>
                      <p className="text-xs font-medium text-zinc-600 mb-1">Recording</p>
                      <AudioPlayer url={entry.recordingUrl} />
                    </div>
                  )}
                  {entry.transcript && (
                    <div>
                      <p className="text-xs font-medium text-zinc-600 mb-1">Transcript</p>
                      <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap text-xs text-zinc-600 font-mono leading-relaxed rounded-lg bg-white p-3">
                        {entry.transcript}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      {/* Follow-up date */}
      {b.followUpDate && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Follow-up scheduled: <span className="font-semibold">{formatDate(b.followUpDate)}</span>
        </div>
      )}
    </div>
  );
}
