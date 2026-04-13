import type { NextRequest } from 'next/server';
import { VapiClient } from '@vapi-ai/server-sdk';
import type { CallStatus, CallStatusResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

const FAILED_END_REASONS = new Set([
  'customer-did-not-answer',
  'customer-busy',
  'twilio-failed-to-connect-call',
  'assistant-join-timed-out',
  'assistant-not-found',
  'assistant-not-valid',
  'assistant-request-failed',
  'call-start-error-vapi-not-connected',
  'manually-canceled',
]);

function isFailedEndReason(reason: string): boolean {
  if (FAILED_END_REASONS.has(reason)) return true;
  if (reason.startsWith('call.start.error')) return true;
  if (reason.startsWith('pipeline-error')) return true;
  return false;
}

function formatEndedReason(reason: string): string {
  const map: Record<string, string> = {
    'customer-did-not-answer':       'The call rang but no one answered.',
    'customer-busy':                 'The line was busy.',
    'voicemail':                     'Voicemail detected.',
    'twilio-failed-to-connect-call': 'Carrier failed to connect the call.',
    'assistant-join-timed-out':      'Vapi timed out before connecting.',
    'silence-timed-out':             'The call timed out due to silence.',
    'exceeded-max-duration':         'The call reached the maximum duration.',
    'assistant-ended-call':          'The agent ended the call.',
    'customer-ended-call':           'The contact hung up.',
    'assistant-said-end-call-phrase':'The agent reached the end-call phrase.',
    'assistant-forwarded-call':      'The call was forwarded.',
    'manually-canceled':             'The call was cancelled.',
  };
  if (map[reason]) return map[reason];
  if (reason.startsWith('pipeline-error-')) {
    return `Pipeline error: ${reason.slice('pipeline-error-'.length).replace(/-/g, ' ')}.`;
  }
  if (reason === 'call.start.error-get-transport') {
    return 'Vapi could not establish a carrier connection — check that VAPI_PHONE_NUMBER_ID is correct and the number is active in your Vapi dashboard.';
  }
  if (reason.startsWith('call.start.error-')) {
    return `Call start error: ${reason.slice('call.start.error-'.length).replace(/-/g, ' ')}.`;
  }
  return reason.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function mapVapiStatus(
  status: string | undefined,
  endedReason: string | undefined
): CallStatus {
  if (!status) return 'calling';
  if (['queued', 'ringing', 'in-progress'].includes(status)) return 'calling';
  if (status === 'ended') {
    // Voicemail detection — treated as left-voicemail, not failed
    if (endedReason === 'voicemail') return 'called-left-voicemail';
    if (endedReason === 'customer-did-not-answer') return 'called-no-answer';
    if (endedReason && isFailedEndReason(endedReason)) return 'failed';
    // Normal end — the analyse endpoint will determine the final outcome
    return 'called-interested'; // Temporary; real outcome set by analyse step
  }
  return 'failed';
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const callId = request.nextUrl.searchParams.get('callId');

    if (!callId) {
      return Response.json(
        { error: 'Missing callId parameter.' } satisfies CallStatusResponse,
        { status: 400 }
      );
    }

    const vapiKey = process.env.VAPI_API_KEY;
    if (!vapiKey) {
      return Response.json(
        { error: 'VAPI_API_KEY is not configured.' } satisfies CallStatusResponse,
        { status: 500 }
      );
    }

    const vapi = new VapiClient({ token: vapiKey });
    const call = await vapi.calls.get({ id: callId });

    const endedReason = call.endedReason as string | undefined;
    const status = mapVapiStatus(call.status, endedReason);

    const artifact = call.artifact;
    const transcript = artifact?.transcript ?? null;
    const recordingUrl = artifact?.recordingUrl ?? null;

    const error =
      status === 'failed' && endedReason ? formatEndedReason(endedReason) : undefined;

    return Response.json({
      callId,
      status,
      transcript,
      recordingUrl,
      endedReason: endedReason ?? null,
      ...(error ? { error } : {}),
    } satisfies CallStatusResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get call status.';
    console.error('[call/status]', err);
    return Response.json(
      {
        callId: '',
        status: 'failed',
        transcript: null,
        recordingUrl: null,
        endedReason: null,
        error: message,
      } satisfies CallStatusResponse,
      { status: 500 }
    );
  }
}
