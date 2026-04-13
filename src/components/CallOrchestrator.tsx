'use client';

import {
  useImperativeHandle,
  forwardRef,
  useRef,
  useEffect,
  useCallback,
} from 'react';
import { upsertBusiness } from '@/lib/storage';
import { delay } from '@/lib/utils';
import type {
  Business,
  AgentSettings,
  CallStartResponse,
  CallStatusResponse,
  AnalyseCallResponse,
  CallOutcome,
  CallStatus,
} from '@/lib/types';

export interface CallOrchestratorHandle {
  startQueue: () => void;
}

interface Props {
  businesses: Business[];
  agentSettings: AgentSettings | null;
  onUpdate: (updated: Business) => void;
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

const CallOrchestrator = forwardRef<CallOrchestratorHandle, Props>(
  function CallOrchestrator({ businesses, onUpdate }, ref) {
    const businessesRef = useRef(businesses);
    const pollingRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
    const failCountRef = useRef<Map<string, number>>(new Map());
    const isProcessingRef = useRef(false);

    useEffect(() => {
      businessesRef.current = businesses;
    }, [businesses]);

    const stopPolling = useCallback((businessId: string) => {
      const interval = pollingRef.current.get(businessId);
      if (interval) {
        clearInterval(interval);
        pollingRef.current.delete(businessId);
      }
    }, []);

    const handleCallComplete = useCallback(
      async (business: Business, transcript: string | null, recordingUrl: string | null, statusFromVapi: CallStatus) => {
        stopPolling(business.id);
        failCountRef.current.delete(business.id);

        let finalStatus: CallStatus = statusFromVapi;
        let notes = '';
        let followUpDate: string | null = null;
        let emailSent = business.emailSent;

        // Analyse transcript via Claude to determine outcome
        if (transcript && !['called-left-voicemail', 'called-no-answer'].includes(statusFromVapi)) {
          try {
            const res = await fetch('/api/call/summarise', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                businessId: business.id,
                companyName: business.companyName,
                contactName: business.contactName,
                phone: business.phone,
                transcript,
              }),
            });
            const data: AnalyseCallResponse = await res.json();
            finalStatus = OUTCOME_TO_STATUS[data.outcome] ?? 'called-maybe';
            notes = data.notes || '';
            followUpDate = data.followUpDate || null;
            if (data.emailRequested) emailSent = false; // flag that email needs to be sent
          } catch {
            // Non-fatal — keep the Vapi-determined status
          }
        }

        const historyEntry = {
          callId: business.callId || '',
          timestamp: new Date().toISOString(),
          outcome: finalStatus,
          transcript,
          recordingUrl,
          duration: null,
          notes,
        };

        const updated: Business = {
          ...business,
          callStatus: finalStatus,
          transcript,
          recordingUrl,
          followUpDate: followUpDate || business.followUpDate,
          emailSent,
          callHistory: [...business.callHistory, historyEntry],
        };

        upsertBusiness(updated);
        onUpdate(updated);
      },
      [onUpdate, stopPolling]
    );

    const startPolling = useCallback(
      (business: Business) => {
        if (!business.callId) return;
        if (pollingRef.current.has(business.id)) return;

        const interval = setInterval(async () => {
          try {
            const res = await fetch(`/api/call/status?callId=${business.callId}`);
            const data: CallStatusResponse = await res.json();

            if (data.status && data.status !== 'calling') {
              await handleCallComplete(business, data.transcript ?? null, data.recordingUrl ?? null, data.status);
            }
          } catch {
            const fails = (failCountRef.current.get(business.id) ?? 0) + 1;
            failCountRef.current.set(business.id, fails);
            if (fails >= 5) {
              stopPolling(business.id);
              const updated: Business = { ...business, callStatus: 'failed', callError: 'Lost contact with Vapi after 5 retries.' };
              upsertBusiness(updated);
              onUpdate(updated);
            }
          }
        }, 5000);

        pollingRef.current.set(business.id, interval);
      },
      [handleCallComplete, onUpdate, stopPolling]
    );

    // Resume polling for any businesses that were mid-call on mount
    useEffect(() => {
      businessesRef.current
        .filter((b) => b.callStatus === 'calling' && b.callId)
        .forEach((b) => startPolling(b));

      return () => {
        pollingRef.current.forEach((interval) => clearInterval(interval));
        pollingRef.current.clear();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const startQueue = useCallback(async () => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;

      try {
        const pending = businessesRef.current.filter(
          (b) => (b.callStatus === 'approved' || b.callStatus === 'researched') && b.phone
        );

        for (let i = 0; i < pending.length; i++) {
          const business = pending[i];

          if (i > 0) await delay(5000);

          const callingState: Business = { ...business, callStatus: 'calling' };
          upsertBusiness(callingState);
          onUpdate(callingState);

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

            const data: CallStartResponse = await res.json();

            if (data.callId) {
              const withCallId: Business = { ...callingState, callId: data.callId };
              upsertBusiness(withCallId);
              onUpdate(withCallId);
              startPolling(withCallId);
            } else {
              throw new Error(data.error ?? 'No call ID returned');
            }
          } catch (err) {
            console.error(`[CallOrchestrator] Failed to start call for ${business.companyName}:`, err);
            const failed: Business = { ...business, callStatus: 'failed', callError: err instanceof Error ? err.message : 'Failed to start call.' };
            upsertBusiness(failed);
            onUpdate(failed);
          }
        }
      } finally {
        isProcessingRef.current = false;
      }
    }, [onUpdate, startPolling]);

    useImperativeHandle(ref, () => ({ startQueue }), [startQueue]);

    return null;
  }
);

export default CallOrchestrator;
