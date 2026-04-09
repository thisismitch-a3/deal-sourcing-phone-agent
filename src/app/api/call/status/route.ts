import type { NextRequest } from 'next/server';
import { VapiClient } from '@vapi-ai/server-sdk';
import type { CallStatus, CallStatusResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

function mapVapiStatus(status: string | undefined): CallStatus {
  if (!status) return 'calling';
  if (['queued', 'ringing', 'in-progress'].includes(status)) return 'calling';
  if (status === 'ended') return 'complete';
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

    const status = mapVapiStatus(call.status);

    // Transcript and recording URL live on call.artifact
    const artifact = call.artifact;
    const transcript = artifact?.transcript ?? null;
    const recordingUrl = artifact?.recordingUrl ?? null;

    return Response.json({
      callId,
      status,
      transcript,
      recordingUrl,
    } satisfies CallStatusResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get call status.';
    console.error('[call/status]', err);
    return Response.json(
      { callId: '', status: 'failed', transcript: null, recordingUrl: null, error: message } satisfies CallStatusResponse,
      { status: 500 }
    );
  }
}
