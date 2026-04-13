'use client';

import { useState, useRef, useCallback } from 'react';
import { upsertBusiness } from '@/lib/storage';
import { generateId } from '@/lib/utils';
import { INDUSTRY_OPTIONS } from '@/lib/utils';
import type {
  Business,
  CallHistoryEntry,
  CallStartResponse,
  CallStatusResponse,
  AnalyseCallResponse,
  CallOutcome,
  CallStatus,
} from '@/lib/types';
import ErrorMessage from './ErrorMessage';
import LoadingSpinner from './LoadingSpinner';

interface TestCallPanelProps {
  onBusinessAdded: (business: Business) => void;
  onBusinessUpdated: (business: Business) => void;
}

const OUTCOME_TO_STATUS: Record<CallOutcome, CallStatus> = {
  'interested': 'called-interested',
  'maybe': 'called-maybe',
  'not-interested': 'called-not-interested',
  'wrong-contact': 'called-wrong-contact',
  'send-info': 'called-send-info',
  'left-voicemail': 'called-left-voicemail',
  'no-answer': 'called-no-answer',
};

export default function TestCallPanel({ onBusinessAdded, onBusinessUpdated }: TestCallPanelProps) {
  const [open, setOpen] = useState(false);

  const [phone, setPhone] = useState('');
  const [contactName, setContactName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [city, setCity] = useState('');
  const [additionalContext, setAdditionalContext] = useState('');

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
    setStatusMessage('Starting call...');

    const business: Business = {
      id: generateId(),
      searchSessionId: 'test',
      createdAt: new Date().toISOString(),
      companyName: companyName.trim() || 'Test Business',
      contactName: contactName.trim() || '',
      phone: phone.trim(),
      email: '',
      city: city.trim() || '',
      industry: industry || '',
      description: '',
      notes: additionalContext.trim(),
      placeId: `test-${Date.now()}`,
      callId: null,
      callStatus: 'calling',
      transcript: null,
      recordingUrl: null,
      researchNotes: additionalContext.trim(),
      talkingPoints: '',
      callHistory: [],
      followUpDate: null,
      emailSent: false,
    };

    upsertBusiness(business);
    onBusinessAdded(business);

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

      const startData: CallStartResponse = await res.json();

      if (!startData.callId) {
        throw new Error(startData.error ?? 'Failed to start call — no call ID returned.');
      }

      const withCallId: Business = { ...business, callId: startData.callId };
      upsertBusiness(withCallId);
      onBusinessUpdated(withCallId);
      setStatusMessage('Call in progress — waiting for it to end...');

      let failCount = 0;
      pollingRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/call/status?callId=${startData.callId}`);
          const statusData: CallStatusResponse = await statusRes.json();

          if (statusData.status && statusData.status !== 'calling') {
            stopPolling();
            setStatusMessage('Call ended — analysing outcome...');

            let finalStatus: CallStatus = statusData.status;
            const historyEntry: CallHistoryEntry = {
              callId: startData.callId!,
              timestamp: new Date().toISOString(),
              outcome: finalStatus,
              transcript: statusData.transcript ?? null,
              recordingUrl: statusData.recordingUrl ?? null,
              duration: null,
              notes: '',
            };

            // Analyse transcript
            if (statusData.transcript && !['called-left-voicemail', 'called-no-answer', 'failed'].includes(statusData.status!)) {
              try {
                const sumRes = await fetch('/api/call/summarise', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    businessId: withCallId.id,
                    companyName: withCallId.companyName,
                    contactName: withCallId.contactName,
                    phone: withCallId.phone,
                    transcript: statusData.transcript,
                  }),
                });
                const sumData: AnalyseCallResponse = await sumRes.json();
                finalStatus = OUTCOME_TO_STATUS[sumData.outcome] ?? 'called-maybe';
                historyEntry.outcome = finalStatus;
                historyEntry.notes = sumData.notes || '';
              } catch {
                // non-fatal
              }
            }

            const completed: Business = {
              ...withCallId,
              callStatus: finalStatus,
              transcript: statusData.transcript ?? null,
              recordingUrl: statusData.recordingUrl ?? null,
              callHistory: [historyEntry],
            };

            upsertBusiness(completed);
            onBusinessUpdated(completed);
            setStatusMessage(null);
            setIsCalling(false);
            setPhone('');
            setContactName('');
            setCompanyName('');
            setIndustry('');
            setCity('');
            setAdditionalContext('');
          }
        } catch {
          failCount++;
          if (failCount >= 5) {
            stopPolling();
            const failed: Business = { ...withCallId, callStatus: 'failed', callError: 'Lost contact with Vapi after 5 retries.' };
            upsertBusiness(failed);
            onBusinessUpdated(failed);
            setError('Lost contact with Vapi after 5 retries.');
            setStatusMessage(null);
            setIsCalling(false);
          }
        }
      }, 5000);

    } catch (err) {
      stopPolling();
      const failed: Business = { ...business, callStatus: 'failed', callError: err instanceof Error ? err.message : 'Something went wrong.' };
      upsertBusiness(failed);
      onBusinessUpdated(failed);
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setStatusMessage(null);
      setIsCalling(false);
    }
  }, [phone, contactName, companyName, industry, city, additionalContext, onBusinessAdded, onBusinessUpdated, stopPolling]);

  const inputCls = 'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50';

  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white">
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
            Quick test call — enter a phone number and business details to test the deal sourcing voice agent.
          </p>

          <ErrorMessage message={error} onDismiss={() => setError(null)} />

          {statusMessage && (
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <LoadingSpinner size="sm" />
              {statusMessage}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
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

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600" htmlFor="test-contact">
                Contact Name
              </label>
              <input
                id="test-contact"
                type="text"
                placeholder="John Smith"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                disabled={isCalling}
                className={inputCls}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600" htmlFor="test-company">
                Company Name
              </label>
              <input
                id="test-company"
                type="text"
                placeholder="ABC Equipment Rental"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={isCalling}
                className={inputCls}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600" htmlFor="test-industry">
                Industry
              </label>
              <select
                id="test-industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                disabled={isCalling}
                className={inputCls}
              >
                <option value="">Select industry...</option>
                {INDUSTRY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
                <option value="Custom">Custom</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600" htmlFor="test-city">
                City
              </label>
              <input
                id="test-city"
                type="text"
                placeholder="Kitchener, ON"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                disabled={isCalling}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600" htmlFor="test-context">
              Additional Context <span className="text-zinc-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="test-context"
              rows={2}
              placeholder="Any extra notes to inject into the system prompt..."
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
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
                Calling...
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
