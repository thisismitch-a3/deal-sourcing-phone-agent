'use client';

import type { CallStatus } from '@/lib/types';

const config: Record<CallStatus, { label: string; className: string }> = {
  pending: {
    label: 'Pending',
    className: 'bg-zinc-100 text-zinc-600',
  },
  researched: {
    label: 'Researched',
    className: 'bg-indigo-100 text-indigo-700',
  },
  approved: {
    label: 'Ready to Call',
    className: 'bg-teal-100 text-teal-700',
  },
  calling: {
    label: 'Calling...',
    className: 'bg-blue-100 text-blue-700 animate-pulse',
  },
  'called-interested': {
    label: 'Interested',
    className: 'bg-green-100 text-green-700',
  },
  'called-maybe': {
    label: 'Maybe',
    className: 'bg-amber-100 text-amber-700',
  },
  'called-not-interested': {
    label: 'Not Interested',
    className: 'bg-zinc-100 text-zinc-600',
  },
  'called-left-voicemail': {
    label: 'Left Voicemail',
    className: 'bg-purple-100 text-purple-700',
  },
  'called-no-answer': {
    label: 'No Answer',
    className: 'bg-zinc-100 text-zinc-600',
  },
  'called-wrong-contact': {
    label: 'Wrong Contact',
    className: 'bg-red-100 text-red-700',
  },
  'called-send-info': {
    label: 'Send Info',
    className: 'bg-blue-100 text-blue-700',
  },
  'callback-received': {
    label: 'Callback Received',
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
