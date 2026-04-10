'use client';

import Link from 'next/link';
import type { Restaurant } from '@/lib/types';
import { formatRating, formatPhone } from '@/lib/utils';
import StatusBadge from './StatusBadge';

interface RestaurantCardProps {
  restaurant: Restaurant;
  onStartCall: (id: string) => void;
  isCallQueued?: boolean;
}

export default function RestaurantCard({
  restaurant: r,
  onStartCall,
  isCallQueued = false,
}: RestaurantCardProps) {
  const canCall =
    (r.callStatus === 'approved' || r.callStatus === 'pending') &&
    r.phone !== null &&
    !isCallQueued;
  const canRetry = r.callStatus === 'failed' && r.phone !== null;

  return (
    <div className="relative flex flex-col rounded-xl border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* Confirmed / not-suitable banner */}
      {r.confirmed && (
        <div className="absolute right-3 top-3 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
          ✓ Confirmed
        </div>
      )}
      {r.notSuitable && (
        <div className="absolute right-3 top-3 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
          ✕ Not suitable
        </div>
      )}

      <Link href={`/restaurant/${r.id}`} className="flex-1 p-5">
        <h3 className="pr-20 text-base font-semibold text-zinc-900 leading-snug">
          {r.name}
        </h3>
        <p className="mt-1 text-sm text-zinc-500">{r.address}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-zinc-700">
            {formatRating(r.rating)}
          </span>
          {r.phone ? (
            <span className="text-sm text-zinc-500">{formatPhone(r.phone)}</span>
          ) : (
            <span className="text-sm italic text-zinc-400">No phone number</span>
          )}
        </div>

        <div className="mt-3">
          <StatusBadge status={r.callStatus} />
        </div>

        {r.callStatus === 'awaiting-approval' && r.suggestedDishes.length > 0 && (
          <p className="mt-2 text-xs text-amber-700 font-medium">
            {r.suggestedDishes.length} dish{r.suggestedDishes.length === 1 ? '' : 'es'} to review
          </p>
        )}
        {r.callStatus === 'approved' && (
          <p className="mt-2 text-xs text-teal-700 font-medium">
            {r.suggestedDishes.filter((d) => d.approved).length} dish{r.suggestedDishes.filter((d) => d.approved).length === 1 ? '' : 'es'} approved — ready to call
          </p>
        )}
        {r.safeMenuOptions.length > 0 && (
          <p className="mt-2 text-xs text-green-700 font-medium">
            {r.safeMenuOptions.length} safe dish{r.safeMenuOptions.length === 1 ? '' : 'es'} found
          </p>
        )}
      </Link>

      {(canCall || canRetry) && (
        <div className="border-t border-zinc-100 px-5 py-3">
          <button
            onClick={() => onStartCall(r.id)}
            className="w-full rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
          >
            {canRetry ? 'Retry Call' : 'Call Now'}
          </button>
        </div>
      )}
    </div>
  );
}
