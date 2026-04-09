'use client';

import type { CallStatus } from '@/lib/types';

const config: Record<CallStatus, { label: string; className: string }> = {
  pending: {
    label: 'Pending',
    className: 'bg-zinc-100 text-zinc-600',
  },
  calling: {
    label: 'Calling...',
    className: 'bg-blue-100 text-blue-700 animate-pulse',
  },
  complete: {
    label: 'Call Complete',
    className: 'bg-green-100 text-green-700',
  },
  failed: {
    label: 'Call Failed',
    className: 'bg-red-100 text-red-700',
  },
  'no-phone': {
    label: 'No Phone Number',
    className: 'bg-amber-100 text-amber-700',
  },
};

interface StatusBadgeProps {
  status: CallStatus;
  className?: string;
}

export default function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const { label, className: badgeClass } = config[status] ?? config.pending;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeClass} ${className}`}
    >
      {label}
    </span>
  );
}
