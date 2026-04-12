'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import type { AgentSettings, PromptSection } from '@/lib/types';
import { DEFAULT_AGENT_SETTINGS, buildPromptSections, assemblePromptFromSections } from '@/lib/utils';

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

function SliderField({
  label,
  hint,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const minLabel = format(min);
  const maxLabel = format(max);
  const valueLabel = format(value);
  return (
    <Field label={`${label} — ${valueLabel}`} hint={hint}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-zinc-900 cursor-pointer"
      />
      <div className="flex justify-between text-xs text-zinc-400 mt-1 select-none">
        <span>{minLabel}</span>
        <span className="font-medium text-zinc-600">{valueLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </Field>
  );
}

function PromptSectionPreview({
  section,
  customValue,
  onCustomChange,
}: {
  section: PromptSection;
  customValue: string;
  onCustomChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-zinc-100 pt-4 mt-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
      >
        <svg
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
            clipRule="evenodd"
          />
        </svg>
        Prompt preview — {section.title}
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3">
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-zinc-600">
              {section.autoContent}
            </pre>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-700">Custom instructions</label>
            <p className="text-xs text-zinc-400">Added to the end of the auto-generated prompt above.</p>
            <textarea
              rows={3}
              value={customValue}
              onChange={(e) => onCustomChange(e.target.value)}
              placeholder="Add any additional instructions for this section…"
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-shadow"
            />
            {customValue.length > 0 && (
              <p className="text-xs text-zinc-400">{customValue.length} characters</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FormattedPromptPreview({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-zinc-600">
      {lines.map((line, i) => {
        if (line.startsWith('## ')) {
          return (
            <span key={i} className="block mt-4 first:mt-0 mb-1 font-semibold text-zinc-800 text-sm font-sans">
              {line.replace('## ', '')}{'\n'}
            </span>
          );
        }
        return <span key={i}>{line}{'\n'}</span>;
      })}
    </pre>
  );
}

const inputCls =
  'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-shadow';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

function fmtPercent(v: number): string {
  return `${Math.round(v * 100)}%`;
}

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
  const promptSections = useMemo(
    () =>
      buildPromptSections({
        restaurantName: 'Example Restaurant',
        dietaryRestrictions: '',
        specificDish: '',
        settings,
      }),
    [settings]
  );

  const fullPromptPreview = useMemo(
    () => assemblePromptFromSections(promptSections),
    [promptSections]
  );

  const getSection = useCallback(
    (id: PromptSection['id']) => promptSections.find((s) => s.id === id)!,
    [promptSections]
  );

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
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-16">
      {/* Page header */}
      <div className="flex items-start justify-between py-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Agent Settings</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Control how the voice agent behaves on every outbound call. Changes take effect on the next call.
          </p>
        </div>
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-700 mt-1 shrink-0">
          ← Dashboard
        </Link>
      </div>

      {/* Two-column layout: settings + sticky preview */}
      <div className="lg:grid lg:grid-cols-[1fr_380px] lg:gap-8 space-y-6 lg:space-y-0">

        {/* ── Left column: all settings ───────────────────────────────────── */}
        <div className="space-y-6">

          {/* ── 1. Identity & Introduction ─────────────────────────────────── */}
          <Section
            title="Your Identity"
            description="The agent IS you — it speaks in first person as you, never as an assistant or bot."
          >
            <Field
              label="Your name"
              hint="The agent introduces itself using this name. It speaks as you — not on your behalf. Used in the opening line and voicemail scripts."
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
              hint="The very first thing said when the call connects. Spoken in first person as you — no mention of AI or assistants. Use {restaurantName} as a placeholder."
            >
              <textarea
                rows={2}
                value={settings.openingLine}
                onChange={(e) => update('openingLine', e.target.value)}
                placeholder="Hi, I'm calling on behalf of…"
                className={inputCls}
              />
            </Field>

            <Field label="Caller tone">
              <RadioGroup
                options={[
                  {
                    value: 'friendly',
                    label: 'Friendly',
                    description: 'Warm and approachable — the default. Feels like a real person calling.',
                  },
                  {
                    value: 'professional',
                    label: 'Professional',
                    description: 'Polished and formal. Complete sentences, no contractions.',
                  },
                  {
                    value: 'casual',
                    label: 'Casual',
                    description: 'Relaxed and informal — as if chatting with a neighbour.',
                  },
                ]}
                value={settings.callerTone}
                onChange={(v) => update('callerTone', v as AgentSettings['callerTone'])}
              />
            </Field>

            <PromptSectionPreview
              section={getSection('identity')}
              customValue={settings.customPromptIdentity}
              onCustomChange={(v) => update('customPromptIdentity', v)}
            />
          </Section>

          {/* ── 2. Voice & Audio ───────────────────────────────────────────── */}
          <Section
            title="Voice & Audio"
            description="ElevenLabs voice parameters. Changes apply to the next outbound call."
          >
            <SliderField
              label="Voice stability"
              hint="Higher = more consistent and predictable. Lower = more expressive and variable."
              value={settings.voiceStability}
              min={0}
              max={1}
              step={0.05}
              format={fmtPercent}
              onChange={(v) => update('voiceStability', v)}
            />

            <SliderField
              label="Similarity boost"
              hint="How closely the voice matches the original clone. Higher = truer to source, but can introduce artefacts."
              value={settings.voiceSimilarityBoost}
              min={0}
              max={1}
              step={0.05}
              format={fmtPercent}
              onChange={(v) => update('voiceSimilarityBoost', v)}
            />

            <SliderField
              label="Speaking speed"
              hint="1.0 is normal speed. Vapi caps ElevenLabs speed at 1.2×."
              value={settings.voiceSpeed}
              min={0.5}
              max={1.2}
              step={0.05}
              format={(v) => `${v.toFixed(2)}×`}
              onChange={(v) => update('voiceSpeed', v)}
            />

            <SliderField
              label="Style exaggeration"
              hint="Amplifies the natural style of the voice. 0 = neutral; higher values can sound more expressive but less stable."
              value={settings.voiceStyle}
              min={0}
              max={1}
              step={0.05}
              format={fmtPercent}
              onChange={(v) => update('voiceStyle', v)}
            />

            <Field
              label="ElevenLabs model"
              hint="The speech synthesis model. Turbo v2.5 has the best voice quality for real-time calls."
            >
              <RadioGroup
                options={[
                  {
                    value: 'eleven_turbo_v2_5',
                    label: 'Turbo v2.5 (recommended)',
                    description: 'Best quality for real-time voice calls.',
                  },
                  {
                    value: 'eleven_multilingual_v2',
                    label: 'Multilingual v2',
                    description: 'Best for accents and non-English languages.',
                  },
                  {
                    value: 'eleven_turbo_v2',
                    label: 'Turbo v2',
                    description: 'Faster but lower quality.',
                  },
                ]}
                value={settings.elevenLabsModel}
                onChange={(v) => update('elevenLabsModel', v as AgentSettings['elevenLabsModel'])}
              />
            </Field>

            <Field
              label="Speaker boost"
              hint="Enhances voice presence and clarity — recommended on."
            >
              <Toggle
                checked={settings.useSpeakerBoost}
                onChange={(v) => update('useSpeakerBoost', v)}
                label="Speaker boost"
              />
            </Field>

            <Field
              label="Streaming quality"
              hint="Lower latency values sacrifice voice quality for speed."
            >
              <RadioGroup
                options={[
                  {
                    value: '2',
                    label: 'Best quality (latency 2)',
                    description: 'Highest voice fidelity — slight delay.',
                  },
                  {
                    value: '3',
                    label: 'Balanced (latency 3)',
                    description: 'Good quality with lower latency.',
                  },
                  {
                    value: '4',
                    label: 'Fastest (latency 4)',
                    description: 'Lowest latency but reduced voice quality.',
                  },
                ]}
                value={String(settings.optimizeStreamingLatency)}
                onChange={(v) => update('optimizeStreamingLatency', Number(v))}
              />
            </Field>

            <Field
              label="Filler words"
              hint='When on, the agent may say "um", "uh", or brief pauses to sound more natural.'
            >
              <Toggle
                checked={settings.fillerWordsEnabled}
                onChange={(v) => update('fillerWordsEnabled', v)}
                label='Use filler words ("um", "uh")'
              />
            </Field>

            <Field
              label="Background denoising"
              hint="Reduces background noise from the restaurant's side using Krisp."
            >
              <Toggle
                checked={settings.backgroundDenoisingEnabled}
                onChange={(v) => update('backgroundDenoisingEnabled', v)}
                label="Background noise reduction"
              />
            </Field>

            <Field
              label="Background sound"
              hint="Ambient sound played on the agent's side during the call. Vapi defaults to 'office' for phone calls."
            >
              <RadioGroup
                options={[
                  { value: 'off', label: 'Off', description: 'Silence — no background sound.' },
                  { value: 'office', label: 'Office', description: 'Subtle call centre ambience.' },
                  { value: 'custom', label: 'Custom audio URL', description: 'Loop your own audio file.' },
                ]}
                value={settings.backgroundSound === 'off' || settings.backgroundSound === 'office' ? settings.backgroundSound : 'custom'}
                onChange={(v) => update('backgroundSound', v === 'custom' ? '' : v)}
              />
            </Field>

            {settings.backgroundSound !== 'off' && settings.backgroundSound !== 'office' && (
              <Field
                label="Custom audio URL"
                hint="URL to an audio file (MP3, WAV). Vapi loops this during the call."
              >
                <input
                  type="url"
                  value={settings.backgroundSound}
                  onChange={(e) => update('backgroundSound', e.target.value)}
                  placeholder="https://example.com/ambient.mp3"
                  className={inputCls}
                />
              </Field>
            )}
          </Section>

          {/* ── 3. Dietary Restrictions & Conversation ─────────────────────── */}
          <Section
            title="Dietary Restrictions & Conversation"
            description="What the agent asks about. Individual searches can override the restriction fields."
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
              hint="When on, the agent tells the restaurant that cross-contamination is acceptable — only dishes that directly contain restricted ingredients are a concern."
            >
              <Toggle
                checked={settings.crossContaminationOk}
                onChange={(v) => update('crossContaminationOk', v)}
                label="Cross-contamination is acceptable"
              />
            </Field>

            <Field
              label="Restriction details"
              hint="A detailed breakdown of what each restriction actually covers. The agent uses this to answer follow-up questions accurately."
            >
              <textarea
                rows={3}
                value={settings.restrictionDetails}
                onChange={(e) => update('restrictionDetails', e.target.value)}
                placeholder="e.g. Garlic includes garlic powder, garlic oil and garlic salt. Soy includes soy sauce, tofu, miso and edamame — but soy lecithin is fine."
                className={inputCls}
              />
            </Field>

            <Field
              label="Extra restriction notes"
              hint="Optional. Any additional context. E.g. severity level, hidden sources to watch out for."
            >
              <textarea
                rows={2}
                value={settings.restrictionNotes}
                onChange={(e) => update('restrictionNotes', e.target.value)}
                placeholder="e.g. Even small traces of garlic cause a reaction — not just a preference."
                className={inputCls}
              />
            </Field>

            <Field
              label="Foods I prefer not to eat"
              hint="Optional. Foods you simply don't enjoy — even if they're technically safe. The agent won't ask about or suggest these."
            >
              <textarea
                rows={2}
                value={settings.foodsToAvoid}
                onChange={(e) => update('foodsToAvoid', e.target.value)}
                placeholder="e.g. salads, fried food, heavy pasta dishes"
                className={inputCls}
              />
            </Field>

            <Field
              label="Dishes to prioritise"
              hint="Optional. Types of dishes to ask about first. The agent leads with these when exploring safe options."
            >
              <textarea
                rows={2}
                value={settings.dishesToPrioritise}
                onChange={(e) => update('dishesToPrioritise', e.target.value)}
                placeholder="e.g. Fish, chicken, or beef dishes. Avoid heavy pasta or fried food."
                className={inputCls}
              />
            </Field>

            <Field
              label="Dish preferences"
              hint="Optional. General style preferences that inform what the agent asks about. E.g. 'pasta, grilled fish, salads'."
            >
              <input
                type="text"
                value={settings.dishPreferences}
                onChange={(e) => update('dishPreferences', e.target.value)}
                placeholder="e.g. pasta, grilled fish, salads"
                className={inputCls}
              />
            </Field>

            <Field
              label="Conversation style notes"
              hint="Optional. Tone or manner guidance specific to dietary conversations."
            >
              <textarea
                rows={2}
                value={settings.conversationStyleNotes}
                onChange={(e) => update('conversationStyleNotes', e.target.value)}
                placeholder="e.g. Be warm and slightly apologetic about the dietary questions — acknowledge it's a lot to ask."
                className={inputCls}
              />
            </Field>

            <Field
              label="How to end the call"
              hint="Optional. Specific closing language or sentiment to use when wrapping up."
            >
              <textarea
                rows={2}
                value={settings.callEndingNotes}
                onChange={(e) => update('callEndingNotes', e.target.value)}
                placeholder="e.g. End warmly — say something like 'I'll definitely consider coming in, thanks so much for your help.'"
                className={inputCls}
              />
            </Field>

            <Field label="If the restaurant is unsure whether a dish is safe…">
              <RadioGroup
                options={[
                  {
                    value: 'escalate',
                    label: 'Ask to speak with someone who knows',
                    description: 'Request the chef or manager before accepting an uncertain answer.',
                  },
                  {
                    value: 'ask-again',
                    label: 'Gently rephrase and ask once more',
                    description: "Rephrase the question once, then accept whatever answer they give.",
                  },
                  {
                    value: 'accept',
                    label: 'Accept their best guess',
                    description: 'Note the dish as uncertain and move on.',
                  },
                ]}
                value={settings.uncertaintyBehaviour}
                onChange={(v) => update('uncertaintyBehaviour', v as AgentSettings['uncertaintyBehaviour'])}
              />
            </Field>

            <PromptSectionPreview
              section={getSection('dietary')}
              customValue={settings.customPromptDietary}
              onCustomChange={(v) => update('customPromptDietary', v)}
            />
          </Section>

          {/* ── 4. Call Behaviour ──────────────────────────────────────────── */}
          <Section
            title="Call Behaviour"
            description="How the agent conducts each call, handles silence, and retries."
          >
            <SliderField
              label="Max call duration"
              hint="Vapi automatically ends the call after this time."
              value={settings.maxCallDurationSeconds}
              min={60}
              max={600}
              step={30}
              format={fmtDuration}
              onChange={(v) => update('maxCallDurationSeconds', v)}
            />

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
                    description: 'Asks follow-up questions about ingredients and preparation. Takes longer but gets more detail.',
                  },
                ]}
                value={settings.callStyle}
                onChange={(v) => update('callStyle', v as AgentSettings['callStyle'])}
              />
            </Field>

            <Field
              label="End call if unable to help?"
              hint="When on, the agent politely hangs up if the restaurant doesn't know. When off, it asks for the chef or manager."
            >
              <Toggle
                checked={settings.endCallIfUnableToHelp}
                onChange={(v) => update('endCallIfUnableToHelp', v)}
                label="Hang up if no one can help"
              />
            </Field>

            <SliderField
              label="Silence timeout"
              hint="Vapi ends the call if there is silence for this long."
              value={settings.silenceTimeoutSeconds}
              min={5}
              max={30}
              step={1}
              format={(v) => `${v}s`}
              onChange={(v) => update('silenceTimeoutSeconds', v)}
            />

            <Field label="If placed on hold…">
              <RadioGroup
                options={[
                  {
                    value: 'wait',
                    label: 'Wait patiently',
                    description: 'Stay on hold for as long as needed.',
                  },
                  {
                    value: 'hang-up',
                    label: 'Hang up after 30 seconds',
                    description: 'End the call politely if left on hold.',
                  },
                ]}
                value={settings.holdBehaviour}
                onChange={(v) => update('holdBehaviour', v as AgentSettings['holdBehaviour'])}
              />
            </Field>

            <SliderField
              label="Max retries"
              hint="How many times to retry a failed or unanswered call before giving up."
              value={settings.maxRetries}
              min={0}
              max={3}
              step={1}
              format={(v) => (v === 0 ? 'No retries' : `${v} retr${v === 1 ? 'y' : 'ies'}`)}
              onChange={(v) => update('maxRetries', v)}
            />

            {settings.maxRetries > 0 && (
              <SliderField
                label="Retry delay"
                hint="How long to wait before retrying a failed call."
                value={settings.retryDelayMinutes}
                min={5}
                max={120}
                step={5}
                format={(v) => `${v} min`}
                onChange={(v) => update('retryDelayMinutes', v)}
              />
            )}

            <PromptSectionPreview
              section={getSection('goals')}
              customValue={settings.customPromptGoals}
              onCustomChange={(v) => update('customPromptGoals', v)}
            />

            <PromptSectionPreview
              section={getSection('rules')}
              customValue={settings.customPromptRules}
              onCustomChange={(v) => update('customPromptRules', v)}
            />
          </Section>

          {/* ── 5. Voicemail Handling ──────────────────────────────────────── */}
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
                onChange={(v) => update('voicemailBehaviour', v as AgentSettings['voicemailBehaviour'])}
              />
            </Field>

            {settings.voicemailBehaviour === 'leave-message' && (
              <Field
                label="Voicemail script"
                hint="Spoken in first person as you. Use {restaurantName} and {ownerName} as placeholders."
              >
                <textarea
                  rows={3}
                  value={settings.voicemailScript}
                  onChange={(e) => update('voicemailScript', e.target.value)}
                  className={inputCls}
                />
              </Field>
            )}

            <PromptSectionPreview
              section={getSection('voicemail')}
              customValue={settings.customPromptVoicemail}
              onCustomChange={(v) => update('customPromptVoicemail', v)}
            />
          </Section>

          {/* ── 6. Menu Research ───────────────────────────────────────────── */}
          <Section
            title="Menu Research"
            description="Before calling, the app looks up each restaurant's website and uses Claude to suggest safe dishes for you to approve."
          >
            <Field
              label="Enable menu pre-research?"
              hint="When on, the app fetches each restaurant's website and identifies likely safe dishes before any call is made. Dishes require your approval before the call starts."
            >
              <Toggle
                checked={settings.menuResearchEnabled}
                onChange={(v) => update('menuResearchEnabled', v)}
                label="Research menus before calling"
              />
            </Field>

            {settings.menuResearchEnabled && (
              <>
                <SliderField
                  label="Max dishes to suggest"
                  hint="Maximum number of dishes Claude will identify per restaurant."
                  value={settings.menuResearchMaxDishes}
                  min={2}
                  max={4}
                  step={1}
                  format={(v) => `${v} dishes`}
                  onChange={(v) => update('menuResearchMaxDishes', v)}
                />

                <Field
                  label="Minimum confidence to show"
                  hint="Hide suggestions below this confidence level."
                >
                  <RadioGroup
                    options={[
                      {
                        value: 'low',
                        label: 'All dishes',
                        description: 'Show high, medium, and low confidence suggestions.',
                      },
                      {
                        value: 'medium',
                        label: 'Medium and above',
                        description: 'Hide low confidence dishes.',
                      },
                      {
                        value: 'high',
                        label: 'High confidence only',
                        description: "Only show dishes Claude is very confident are safe.",
                      },
                    ]}
                    value={settings.menuResearchConfidenceThreshold}
                    onChange={(v) => update('menuResearchConfidenceThreshold', v as AgentSettings['menuResearchConfidenceThreshold'])}
                  />
                </Field>
              </>
            )}
          </Section>

          {/* ── 7. Inbound / Callback ──────────────────────────────────────── */}
          <Section
            title="Inbound / Callback"
            description="Settings for when a restaurant calls back your Vapi number."
          >
            <Field
              label="Your phone number"
              hint="Your real phone number in E.164 format. When a restaurant calls back, they'll be transferred to you after the whisper plays. E.g. +16135551234."
            >
              <input
                type="tel"
                value={settings.forwardingNumber}
                onChange={(e) => update('forwardingNumber', e.target.value)}
                placeholder="+16135551234"
                className={inputCls}
              />
            </Field>

            <SliderField
              label="Ring timeout"
              hint="How long to ring your number before giving up and using the fallback."
              value={settings.ringTimeoutSeconds}
              min={10}
              max={30}
              step={1}
              format={(v) => `${v}s`}
              onChange={(v) => update('ringTimeoutSeconds', v)}
            />

            <Field label="If you don't answer…">
              <RadioGroup
                options={[
                  {
                    value: 'voicemail',
                    label: 'Take a voicemail',
                    description: 'The AI agent offers to take a message. Appears in your dashboard.',
                  },
                  {
                    value: 'agent',
                    label: 'AI agent handles the call',
                    description: 'The agent gathers additional information and records the conversation.',
                  },
                  {
                    value: 'hang-up',
                    label: 'Hang up',
                    description: 'End the call politely without taking a message.',
                  },
                ]}
                value={settings.fallbackBehaviour}
                onChange={(v) => update('fallbackBehaviour', v as AgentSettings['fallbackBehaviour'])}
              />
            </Field>

            <Field
              label="Enable call whisper?"
              hint="When on, a brief AI-generated summary plays only to you before the call connects — restaurant name, safe dishes found, rating."
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
                      description: 'Full summary — restaurant name, neighbourhood, rating, restrictions discussed, and all safe dishes found.',
                    },
                  ]}
                  value={settings.whisperStyle}
                  onChange={(v) => update('whisperStyle', v as AgentSettings['whisperStyle'])}
                />
              </Field>
            )}
          </Section>

          {/* ── 8. Notifications ───────────────────────────────────────────── */}
          <Section
            title="Notifications"
            description="Email alerts for call events. Requires a webhook or SMTP integration."
          >
            <Field
              label="Notify on call complete?"
              hint="Send an email when a call finishes and safe dishes are extracted."
            >
              <Toggle
                checked={settings.notifyOnCallComplete}
                onChange={(v) => update('notifyOnCallComplete', v)}
                label="Email on call complete"
              />
            </Field>

            <Field
              label="Notify on missed callback?"
              hint="Send an email if a restaurant calls back and you don't answer."
            >
              <Toggle
                checked={settings.notifyOnMissedCallback}
                onChange={(v) => update('notifyOnMissedCallback', v)}
                label="Email on missed callback"
              />
            </Field>

            {(settings.notifyOnCallComplete || settings.notifyOnMissedCallback) && (
              <Field
                label="Notification email"
                hint="Where to send alerts."
              >
                <input
                  type="email"
                  value={settings.notifyEmail}
                  onChange={(e) => update('notifyEmail', e.target.value)}
                  placeholder="you@example.com"
                  className={inputCls}
                />
              </Field>
            )}

            <Field
              label="Webhook URL"
              hint="Optional. POST call events to this URL as JSON. Leave blank to disable."
            >
              <input
                type="url"
                value={settings.webhookUrl}
                onChange={(e) => update('webhookUrl', e.target.value)}
                placeholder="https://your-server.com/webhook"
                className={inputCls}
              />
            </Field>
          </Section>

          {/* ── 9. Dashboard Defaults ──────────────────────────────────────── */}
          <Section
            title="Dashboard Defaults"
            description="Pre-fill the search form with these values each time you start a new search."
          >
            <SliderField
              label="Default search radius"
              hint="How far from the searched location to look for restaurants."
              value={settings.defaultSearchRadius}
              min={1}
              max={20}
              step={1}
              format={(v) => `${v} km`}
              onChange={(v) => update('defaultSearchRadius', v)}
            />

            <SliderField
              label="Default minimum rating"
              hint="Only show restaurants at or above this Google Maps rating."
              value={settings.defaultMinRating}
              min={0}
              max={5}
              step={0.5}
              format={(v) => `${v.toFixed(1)} ★`}
              onChange={(v) => update('defaultMinRating', v)}
            />

            <Field
              label="Default cuisine type"
              hint='Optional. Pre-fills the cuisine filter. E.g. "Italian", "Japanese". Leave blank for all cuisines.'
            >
              <input
                type="text"
                value={settings.defaultCuisineType}
                onChange={(e) => update('defaultCuisineType', e.target.value)}
                placeholder="e.g. Italian, Japanese (optional)"
                className={inputCls}
              />
            </Field>

            <SliderField
              label="Default max restaurants"
              hint="How many restaurants to load per search by default."
              value={settings.defaultMaxRestaurants}
              min={5}
              max={20}
              step={1}
              format={(v) => `${v} restaurants`}
              onChange={(v) => update('defaultMaxRestaurants', v)}
            />

            <Field
              label="Auto-start calls after search?"
              hint="When on, calls begin automatically as soon as a search completes — no manual trigger required."
            >
              <Toggle
                checked={settings.autoStartCalls}
                onChange={(v) => update('autoStartCalls', v)}
                label="Auto-start calls"
              />
            </Field>
          </Section>

          {/* ── Save button ────────────────────────────────────────────────── */}
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
                Last saved{' '}
                {new Date(settings.updatedAt).toLocaleString('en-CA', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>
        </div>

        {/* ── Right column: sticky system prompt preview ──────────────────── */}
        <div className="lg:sticky lg:top-8 lg:self-start space-y-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900">System Prompt Preview</h3>
                <p className="text-xs text-zinc-400 mt-0.5">Updates live as you edit</p>
              </div>
              <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 font-medium select-none">
                read-only
              </span>
            </div>
            <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
              Exactly what the agent will be told at the start of each outbound call.{' '}
              <span className="italic">"Example Restaurant"</span> is substituted with the real restaurant name at call time.
            </p>
            <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-zinc-100 bg-zinc-50 p-3">
              <FormattedPromptPreview text={fullPromptPreview} />
            </div>
            <p className="mt-2 text-xs text-zinc-400">
              {fullPromptPreview.length.toLocaleString()} characters
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
