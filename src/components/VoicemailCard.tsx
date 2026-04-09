'use client';

import type { Voicemail } from '@/lib/types';
import { formatDate, formatPhone } from '@/lib/utils';
import AudioPlayer from './AudioPlayer';

interface VoicemailCardProps {
  voicemail: Voicemail;
  onMarkReviewed: (id: string) => void;
}

export default function VoicemailCard({ voicemail: vm, onMarkReviewed }: VoicemailCardProps) {
  return (
    <div
      className={`rounded-xl border bg-white p-5 shadow-sm ${
        vm.reviewed ? 'border-zinc-200 opacity-60' : 'border-blue-200'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-zinc-900">
            {vm.restaurantName ?? formatPhone(vm.restaurantPhone)}
          </p>
          <p className="text-sm text-zinc-500">{formatDate(vm.receivedAt)}</p>
          {!vm.restaurantName && (
            <p className="text-xs text-zinc-400">{formatPhone(vm.restaurantPhone)}</p>
          )}
        </div>
        {!vm.reviewed && (
          <button
            onClick={() => onMarkReviewed(vm.id)}
            className="shrink-0 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 hover:bg-green-200 transition-colors"
          >
            Mark reviewed
          </button>
        )}
        {vm.reviewed && (
          <span className="shrink-0 rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-500">
            ✓ Reviewed
          </span>
        )}
      </div>

      {vm.recordingUrl && (
        <div className="mt-3">
          <AudioPlayer url={vm.recordingUrl} />
        </div>
      )}

      {vm.transcript && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-zinc-500 hover:text-zinc-700">
            Show transcript
          </summary>
          <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600 font-mono leading-relaxed">
            {vm.transcript}
          </pre>
        </details>
      )}
    </div>
  );
}
