import type { NextRequest } from 'next/server';
import { getVoicemails, markVoicemailReviewed } from '@/lib/kv';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest): Promise<Response> {
  try {
    const voicemails = await getVoicemails();
    return Response.json({ voicemails });
  } catch (err) {
    console.error('[inbound/voicemails GET]', err);
    return Response.json({ voicemails: [], error: 'Failed to load voicemails.' });
  }
}

export async function PATCH(request: NextRequest): Promise<Response> {
  try {
    const { id } = await request.json();
    if (!id) {
      return Response.json({ error: 'Missing voicemail id.' }, { status: 400 });
    }
    await markVoicemailReviewed(id);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[inbound/voicemails PATCH]', err);
    return Response.json({ error: 'Failed to mark voicemail as reviewed.' }, { status: 500 });
  }
}
