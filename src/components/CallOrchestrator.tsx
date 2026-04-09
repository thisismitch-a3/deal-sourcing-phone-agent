'use client';

import {
  useImperativeHandle,
  forwardRef,
  useRef,
  useEffect,
  useCallback,
} from 'react';
import { upsertRestaurant } from '@/lib/storage';
import { delay } from '@/lib/utils';
import type { Restaurant, SearchSession, CallStartResponse, CallStatusResponse, SummariseResponse } from '@/lib/types';

export interface CallOrchestratorHandle {
  startQueue: () => void;
}

interface Props {
  restaurants: Restaurant[];
  searchSession: SearchSession | null;
  onUpdate: (updated: Restaurant) => void;
}

const CallOrchestrator = forwardRef<CallOrchestratorHandle, Props>(
  function CallOrchestrator({ restaurants, searchSession, onUpdate }, ref) {
    const restaurantsRef = useRef(restaurants);
    const pollingRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
    const failCountRef = useRef<Map<string, number>>(new Map());
    const isProcessingRef = useRef(false);

    // Keep ref in sync so callbacks always see latest list
    useEffect(() => {
      restaurantsRef.current = restaurants;
    }, [restaurants]);

    // ── Polling ──────────────────────────────────────────────────────────────

    const stopPolling = useCallback((restaurantId: string) => {
      const interval = pollingRef.current.get(restaurantId);
      if (interval) {
        clearInterval(interval);
        pollingRef.current.delete(restaurantId);
      }
    }, []);

    const handleCallComplete = useCallback(
      async (restaurant: Restaurant, transcript: string | null, recordingUrl: string | null) => {
        stopPolling(restaurant.id);
        failCountRef.current.delete(restaurant.id);

        let safeMenuOptions: string[] = [];

        // Summarise transcript via Claude
        if (transcript && searchSession) {
          try {
            const res = await fetch('/api/call/summarise', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                restaurantId: restaurant.id,
                restaurantName: restaurant.name,
                phone: restaurant.phone,
                transcript,
                dietaryRestrictions: searchSession.dietaryRestrictions,
              }),
            });
            const data: SummariseResponse = await res.json();
            safeMenuOptions = data.safeMenuOptions ?? [];
          } catch {
            // Non-fatal — show empty options
          }
        }

        const updated: Restaurant = {
          ...restaurant,
          callStatus: 'complete',
          transcript,
          recordingUrl,
          safeMenuOptions,
        };

        upsertRestaurant(updated);
        onUpdate(updated);
      },
      [searchSession, onUpdate, stopPolling]
    );

    const startPolling = useCallback(
      (restaurant: Restaurant) => {
        if (!restaurant.callId) return;
        if (pollingRef.current.has(restaurant.id)) return; // already polling

        const interval = setInterval(async () => {
          try {
            const res = await fetch(`/api/call/status?callId=${restaurant.callId}`);
            const data: CallStatusResponse = await res.json();

            if (data.status === 'complete') {
              await handleCallComplete(restaurant, data.transcript ?? null, data.recordingUrl ?? null);
            } else if (data.status === 'failed') {
              stopPolling(restaurant.id);
              const updated: Restaurant = { ...restaurant, callStatus: 'failed' };
              upsertRestaurant(updated);
              onUpdate(updated);
            }
            // 'calling' — keep polling
          } catch {
            const fails = (failCountRef.current.get(restaurant.id) ?? 0) + 1;
            failCountRef.current.set(restaurant.id, fails);
            if (fails >= 5) {
              stopPolling(restaurant.id);
              const updated: Restaurant = { ...restaurant, callStatus: 'failed' };
              upsertRestaurant(updated);
              onUpdate(updated);
            }
          }
        }, 5000);

        pollingRef.current.set(restaurant.id, interval);
      },
      [handleCallComplete, onUpdate, stopPolling]
    );

    // On mount, resume polling for any restaurants that were mid-call
    useEffect(() => {
      restaurantsRef.current
        .filter((r) => r.callStatus === 'calling' && r.callId)
        .forEach((r) => startPolling(r));

      return () => {
        pollingRef.current.forEach((interval) => clearInterval(interval));
        pollingRef.current.clear();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Queue ─────────────────────────────────────────────────────────────────

    const startQueue = useCallback(async () => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;

      try {
        const pending = restaurantsRef.current.filter(
          (r) => r.callStatus === 'pending' && r.phone
        );

        for (let i = 0; i < pending.length; i++) {
          const restaurant = pending[i];

          if (i > 0) await delay(5000); // rate-limit between calls

          // Mark as calling
          const callingState: Restaurant = { ...restaurant, callStatus: 'calling' };
          upsertRestaurant(callingState);
          onUpdate(callingState);

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
                dietaryRestrictions: searchSession?.dietaryRestrictions ?? 'No garlic, no soy — cross-contamination is fine',
                specificDish: searchSession?.specificDish ?? '',
              }),
            });

            const data: CallStartResponse = await res.json();

            if (data.callId) {
              const withCallId: Restaurant = {
                ...callingState,
                callId: data.callId,
              };
              upsertRestaurant(withCallId);
              onUpdate(withCallId);
              startPolling(withCallId);
            } else {
              throw new Error(data.error ?? 'No call ID returned');
            }
          } catch (err) {
            console.error(`[CallOrchestrator] Failed to start call for ${restaurant.name}:`, err);
            const failed: Restaurant = { ...restaurant, callStatus: 'failed' };
            upsertRestaurant(failed);
            onUpdate(failed);
          }
        }
      } finally {
        isProcessingRef.current = false;
      }
    }, [searchSession, onUpdate, startPolling]);

    useImperativeHandle(ref, () => ({ startQueue }), [startQueue]);

    return null; // invisible — logic only
  }
);

export default CallOrchestrator;
