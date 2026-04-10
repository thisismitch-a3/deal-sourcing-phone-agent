'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import type { AgentSettings } from '@/lib/types';
import { DEFAULT_AGENT_SETTINGS, buildVapiSystemPromptFromSettings } from '@/lib/utils';

// ─── Sub-components ──────────────────────────────────────────────────────────

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 space-y-5">
      <div className="border-b border-zinc-100 pb-4">
        <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
      </div>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-zinc-700">{label}</label>
      {hint && <p className="text-xs text-zinc-400 leading-relaxed">{hint}</p>}
      {children}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 ${
          checked ? 'bg-zinc-900' : 'bg-zinc-300'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
      {label && (
        <span className="text-sm text-zinc-600">{checked ? label : `${label} (off)`}</span>
      )}
    </div>
  );
}

function RadioGroup({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string; description?: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
            value === opt.value
              ? 'border-zinc-900 bg-zinc-50'
              : 'border-zinc-200 hover:border-zinc-300'
          }`}
        >
          <input
            type="radio"
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="mt-0.5 accent-zinc-900"
          />
          <div>
            <div className="text-sm font-medium text-zinc-700">{opt.label}</div>
            {opt.description && (
              <div className="mt-0.5 text-xs text-zinc-400">{opt.description}</div>
            )}
          </div>
        </label>
      ))}
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-shadow';

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [settings, setSettings] = useState<AgentSettings>(DEFAULT_AGENT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        if (data.settings) {
          setSettings({ ...DEFAULT_AGENT_SETTINGS, ...data.settings });
        }
      })
      .catch(() => {
        // Use defaults if fetch fails
      })
      .finally(() => setLoading(false));
  }, []);

  const update = useCallback(<K extends keyof AgentSettings>(key: K, value: AgentSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaveStatus('idle');
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaveStatus('idle');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 4000);
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  }

  // Live preview — rendered with "Example Restaurant" as a stand-in
  const systemPromptPreview = useMemo(
    () =>
      buildVapiSystemPromptFromSettings({
        restaurantName: 'Example Restaurant',
        dietaryRestrictions: '', // uses settings.dietaryRestrictions
        specificDish: '',
        settings,
      }),
    [settings]
  );

  const durationLabel = (() => {
    const s = settings.maxCallDurationSeconds;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex items-center gap-3 text-zinc-500">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Loading settings…
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-16">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Agent Settings</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Control how the voice agent behaves on every outbound call.
          </p>
        </div>
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-700 mt-1">
          ← Dashboard
        </Link>
      </div>

      {/* ── Identity ─────────────────────────────────────────────────────── */}
      <Section
        title="Identity"
        description="Who the agent represents and how it introduces itself."
      >
        <Field
          label="Owner name"
          hint='Used wherever the agent says "I\'m calling on behalf of…". Appears in the system prompt and whisper messages.'
        >
          <input
            type="text"
            value={settings.ownerName}
            onChange={(e) => update('ownerName', e.target.value)}
            placeholder="Mitchel Campbell"
            className={inputCls}
          />
        </Field>

        <Field
          label="Opening line"
          hint="The first thing the agent says when the call connects. You can use {restaurantName} as a placeholder."
        >
          <textarea
            rows={2}
            value={settings.openingLine}
            onChange={(e) => update('openingLine', e.target.value)}
            placeholder="Hi, I'm calling on behalf of…"
            className={inputCls}
          />
        </Field>
      </Section>

      {/* ── Dietary Restrictions ─────────────────────────────────────────── */}
      <Section
        title="Dietary Restrictions"
        description="What the agent asks about on every call. These are the defaults — individual searches can override them."
      >
        <Field
          label="Restrictions"
          hint='Comma-separated list of ingredients to avoid. E.g. "garlic, soy, shellfish".'
        >
          <input
            type="text"
            value={settings.dietaryRestrictions}
            onChange={(e) => update('dietaryRestrictions', e.target.value)}
            placeholder="garlic, soy"
            className={inputCls}
          />
        </Field>

        <Field
          label="Cross-contamination OK?"
          hint="When on, the agent tells the restaurant that cross-contamination is fine — only dishes that directly contain the restricted ingredients are a problem."
        >
          <Toggle
            checked={settings.crossContaminationOk}
            onChange={(v) => update('crossContaminationOk', v)}
            label="Cross-contamination is acceptable"
          />
        </Field>

        <Field
          label="Extra notes for the agent"
          hint="Optional. Any additional context about the restrictions that the agent should know. E.g. severity, common hidden sources."
        >
          <textarea
            rows={2}
            value={settings.restrictionNotes}
            onChange={(e) => update('restrictionNotes', e.target.value)}
            placeholder="e.g. Garlic powder and garlic oil count — not just fresh garlic."
            className={inputCls}
          />
        </Field>
      </Section>

      {/* ── Call Behaviour ───────────────────────────────────────────────── */}
      <Section
        title="Call Behaviour"
        description="How the agent conducts each call."
      >
        <Field
          label={`Max call duration — ${durationLabel}`}
          hint="Maximum time before Vapi automatically ends the call."
        >
          <input
            type="range"
            min={60}
            max={600}
            step={30}
            value={settings.maxCallDurationSeconds}
            onChange={(e) => update('maxCallDurationSeconds', Number(e.target.value))}
            className="w-full accent-zinc-900 cursor-pointer"
          />
          <div className="flex justify-between text-xs text-zinc-400 mt-1 select-none">
            <span>1 min</span>
            <span className="font-medium text-zinc-600">{durationLabel}</span>
            <span>10 min</span>
          </div>
        </Field>

        <Field label="Call style">
          <RadioGroup
            options={[
              {
                value: 'brief',
                label: 'Brief',
                description: 'Concise and direct — in and out in under 2 minutes.',
              },
              {
                value: 'thorough',
                label: 'Thorough',
                description:
                  'Asks follow-up questions about ingredients and preparation — takes longer but gets more detail.',
              },
            ]}
            value={settings.callStyle}
            onChange={(v) => update('callStyle', v as 'brief' | 'thorough')}
          />
        </Field>

        <Field
          label="End call if unable to help?"
          hint="When on, the agent politely hangs up if the restaurant doesn't know. When off, it asks to speak with someone who might — like the chef or manager."
        >
          <Toggle
            checked={settings.endCallIfUnableToHelp}
            onChange={(v) => update('endCallIfUnableToHelp', v)}
            label="Hang up if no one can help"
          />
        </Field>
      </Section>

      {/* ── Whisper ──────────────────────────────────────────────────────── */}
      <Section
        title="Call Whisper"
        description="A private summary read only to you before a restaurant's callback is connected."
      >
        <Field
          label="Enable whisper?"
          hint="When on, Claude generates a spoken summary of the restaurant context — what you found, safe dishes, rating — played only to you before the call connects."
        >
          <Toggle
            checked={settings.whisperEnabled}
            onChange={(v) => update('whisperEnabled', v)}
            label="Whisper enabled"
          />
        </Field>

        {settings.whisperEnabled && (
          <Field label="Whisper detail level">
            <RadioGroup
              options={[
                {
                  value: 'brief',
                  label: 'Brief',
                  description: 'Restaurant name and key finding in 2–3 sentences.',
                },
                {
                  value: 'detailed',
                  label: 'Detailed',
                  description:
                    'Full summary — restaurant name, neighbourhood, rating, restrictions discussed, and all safe dishes found.',
                },
              ]}
              value={settings.whisperStyle}
              onChange={(v) => update('whisperStyle', v as 'brief' | 'detailed')}
            />
          </Field>
        )}
      </Section>

      {/* ── Voicemail Handling ───────────────────────────────────────────── */}
      <Section
        title="Voicemail Handling"
        description="What the agent does if a restaurant doesn't pick up."
      >
        <Field label="If the call goes to voicemail…">
          <RadioGroup
            options={[
              {
                value: 'hang-up',
                label: 'Hang up silently',
                description: 'End the call without leaving a message.',
              },
              {
                value: 'leave-message',
                label: 'Leave a message',
                description: 'Recite a custom script, then hang up.',
              },
            ]}
            value={settings.voicemailBehaviour}
            onChange={(v) => update('voicemailBehaviour', v as 'hang-up' | 'leave-message')}
          />
        </Field>

        {settings.voicemailBehaviour === 'leave-message' && (
          <Field
            label="Voicemail script"
            hint="What the agent will say. Use {restaurantName} and {ownerName} as placeholders."
          >
            <textarea
              rows={3}
              value={settings.voicemailScript}
              onChange={(e) => update('voicemailScript', e.target.value)}
              className={inputCls}
            />
          </Field>
        )}
      </Section>

      {/* ── Save button ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>

        {saveStatus === 'saved' && (
          <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
            Settings saved
          </span>
        )}

        {saveStatus === 'error' && (
          <span className="flex items-center gap-1.5 text-sm font-medium text-red-600">
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
            </svg>
            Failed to save — please try again
          </span>
        )}

        {settings.updatedAt && saveStatus === 'idle' && (
          <span className="text-xs text-zinc-400">
            Last saved {new Date(settings.updatedAt).toLocaleString('en-CA', {
              month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
            })}
          </span>
        )}
      </div>

      {/* ── System Prompt Preview ────────────────────────────────────────── */}
      <Section
        title="System Prompt Preview"
        description='Exactly what the agent will be told at the start of each outbound call. Updates live as you edit settings above. "Example Restaurant" is used as a placeholder — the actual restaurant name is substituted at call time.'
      >
        <div className="relative">
          <pre className="whitespace-pre-wrap rounded-lg border border-zinc-200 bg-zinc-50 p-4 font-mono text-xs leading-relaxed text-zinc-600 overflow-x-auto">
            {systemPromptPreview}
          </pre>
          <span className="absolute top-2 right-2 rounded bg-zinc-200 px-1.5 py-0.5 text-xs text-zinc-500 font-medium select-none">
            read-only
          </span>
        </div>
      </Section>
    </div>
  );
}
