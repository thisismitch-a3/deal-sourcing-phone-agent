'use client';

import Link from 'next/link';
import type { Business } from '@/lib/types';
import { formatPhone } from '@/lib/utils';
import StatusBadge from './StatusBadge';

interface BusinessCardProps {
  business: Business;
  onStartCall: (id: string) => void;
  onDelete: (id: string) => void;
  isCallQueued?: boolean;
}

export default function BusinessCard({
  business: b,
  onStartCall,
  onDelete,
  isCallQueued = false,
}: BusinessCardProps) {
  const canCall =
    (b.callStatus === 'approved' || b.callStatus === 'researched') &&
    b.phone !== null &&
    !isCallQueued;
  const canRetry = b.callStatus === 'failed' && b.phone !== null;

  return (
    <div className="relative flex flex-col rounded-xl border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* Delete button */}
      <button
        onClick={(e) => { e.preventDefault(); onDelete(b.id); }}
        className="absolute right-3 top-3 z-10 rounded-full p-1 text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors"
        aria-label="Delete"
        title="Remove from dashboard"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"/>
        </svg>
      </button>

      <Link href={`/business/${b.id}`} className="flex-1 p-5">
        <h3 className="pr-8 text-base font-semibold text-zinc-900 leading-snug">
          {b.companyName}
        </h3>
        {b.contactName && (
          <p className="mt-0.5 text-sm text-zinc-600">{b.contactName}</p>
        )}
        <p className="mt-1 text-sm text-zinc-500">
          {[b.industry, b.city].filter(Boolean).join(' · ')}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {b.phone ? (
            <span className="text-sm text-zinc-500">{formatPhone(b.phone)}</span>
          ) : (
            <span className="text-sm italic text-zinc-400">No phone number</span>
          )}
        </div>

        <div className="mt-3">
          <StatusBadge status={b.callStatus} />
          {b.callStatus === 'failed' && b.callError && (
            <p className="mt-1 text-xs text-red-500 leading-snug">{b.callError}</p>
          )}
        </div>

        {b.emailSent && (
          <p className="mt-2 text-xs text-blue-600 font-medium">Email sent</p>
        )}
      </Link>

      {(canCall || canRetry) && (
        <div className="border-t border-zinc-100 px-5 py-3">
          <button
            onClick={() => onStartCall(b.id)}
            className="w-full rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
          >
            {canRetry ? 'Retry Call' : 'Call Now'}
          </button>
        </div>
      )}
    </div>
  );
}
