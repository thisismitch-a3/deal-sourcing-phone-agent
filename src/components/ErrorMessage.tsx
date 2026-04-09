'use client';

interface ErrorMessageProps {
  message: string | null;
  onDismiss?: () => void;
}

export default function ErrorMessage({ message, onDismiss }: ErrorMessageProps) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      <span className="mt-0.5 shrink-0 text-red-500">⚠</span>
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 text-red-400 hover:text-red-600"
          aria-label="Dismiss error"
        >
          ✕
        </button>
      )}
    </div>
  );
}
