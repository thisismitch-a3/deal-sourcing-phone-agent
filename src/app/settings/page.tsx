'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import type { AgentSettings, PromptSection } from '@/lib/types';
import { DEFAULT_AGENT_SETTINGS, buildPromptSections, assemblePromptFromSections, INDUSTRY_OPTIONS } from '@/lib/utils';

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
              placeholder="Add any additional instructions for this section..."
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

  // Live preview with sample business
  const promptSections = useMemo(
    () =>
      buildPromptSections({
        companyName: 'Example Company Ltd.',
        contactName: 'John Smith',
        city: 'Kitchener, ON',
        industry: 'Manufacturing',
        description: 'Established manufacturing business specializing in custom metal fabrication.',
        researchNotes: 'In business since 1995. ~25 employees. Revenue estimated $3-5M.',
        talkingPoints: 'Long-standing community business\nOwner approaching retirement age',
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
          Loading settings...
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
            Control how the deal sourcing agent behaves on every outbound call. Changes take effect on the next call.
          </p>
        </div>
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-700 mt-1 shrink-0">
          &larr; Dashboard
        </Link>
      </div>

      {/* Two-column layout: settings + sticky preview */}
      <div className="lg:grid lg:grid-cols-[1fr_380px] lg:gap-8 space-y-6 lg:space-y-0">

        {/* ── Left column: all settings ───────────────────────────────────── */}
        <div className="space-y-6">

          {/* ── 1. Agent Identity ───────────────────────────────────────────── */}
          <Section
            title="Agent Identity"
            description="Who the agent presents itself as on calls. It speaks in first person as this identity."
          >
            <Field
              label="Agent name"
              hint="The name the agent uses when introducing itself on calls."
            >
              <input
                type="text"
                value={settings.agentName}
                onChange={(e) => update('agentName', e.target.value)}
                placeholder="Mitchel Campbell"
                className={inputCls}
              />
            </Field>

            <Field
              label="Company name"
              hint="The brokerage or firm the agent represents."
            >
              <input
                type="text"
                value={settings.companyName}
                onChange={(e) => update('companyName', e.target.value)}
                placeholder="AR Business Brokers"
                className={inputCls}
              />
            </Field>

            <Field
              label="Agent phone number"
              hint="Read-only. This is the Vapi outbound number used for caller ID and voicemail callbacks. To change it, update the VAPI_PHONE_NUMBER_ID environment variable and the default in code."
            >
              <input
                type="tel"
                value={settings.companyPhone}
                readOnly
                className={`${inputCls} bg-zinc-50 text-zinc-500 cursor-not-allowed`}
              />
            </Field>

            <Field
              label="Company website"
              hint="Mentioned if the prospect asks for more information."
            >
              <input
                type="text"
                value={settings.companyWebsite}
                onChange={(e) => update('companyWebsite', e.target.value)}
                placeholder="arbb.ca"
                className={inputCls}
              />
            </Field>

            <PromptSectionPreview
              section={getSection('identity')}
              customValue={settings.customPromptIdentity}
              onCustomChange={(v) => update('customPromptIdentity', v)}
            />
          </Section>

          {/* ── 2. Buyer Profile ────────────────────────────────────────────── */}
          <Section
            title="Buyer Profile"
            description="Describes the buyer the agent represents. This information shapes how the agent describes the opportunity."
          >
            <Field
              label="Buyer description"
              hint="A paragraph describing the buyer without revealing their identity. Injected into the system prompt."
            >
              <textarea
                rows={4}
                value={settings.buyerDescription}
                onChange={(e) => update('buyerDescription', e.target.value)}
                className={inputCls}
              />
            </Field>

            <Field
              label="Target industries"
              hint="Select which industries the buyer is interested in."
            >
              <div className="grid grid-cols-2 gap-2">
                {INDUSTRY_OPTIONS.map((ind) => (
                  <label key={ind} className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.targetIndustries.includes(ind)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          update('targetIndustries', [...settings.targetIndustries, ind]);
                        } else {
                          update('targetIndustries', settings.targetIndustries.filter((i) => i !== ind));
                        }
                      }}
                      className="accent-zinc-900"
                    />
                    {ind}
                  </label>
                ))}
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Revenue range" hint="Annual revenue target.">
                <input
                  type="text"
                  value={settings.revenueRange}
                  onChange={(e) => update('revenueRange', e.target.value)}
                  placeholder="$1M - $10M"
                  className={inputCls}
                />
              </Field>

              <Field label="EBITDA range" hint="Target earnings range.">
                <input
                  type="text"
                  value={settings.ebitdaRange}
                  onChange={(e) => update('ebitdaRange', e.target.value)}
                  placeholder="$500K - $3M"
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Geography" hint="Target geographic area.">
                <input
                  type="text"
                  value={settings.geography}
                  onChange={(e) => update('geography', e.target.value)}
                  placeholder="Southwestern Ontario"
                  className={inputCls}
                />
              </Field>

              <Field label="Max purchase price" hint="Upper limit for acquisition.">
                <input
                  type="text"
                  value={settings.maxPurchasePrice}
                  onChange={(e) => update('maxPurchasePrice', e.target.value)}
                  placeholder="$5M"
                  className={inputCls}
                />
              </Field>
            </div>

            <PromptSectionPreview
              section={getSection('buyer')}
              customValue={settings.customPromptBuyer}
              onCustomChange={(v) => update('customPromptBuyer', v)}
            />
          </Section>

          {/* ── 3. Call Behavior ────────────────────────────────────────────── */}
          <Section
            title="Call Behavior"
            description="How the agent conducts each outbound call."
          >
            <Field label="First message mode">
              <RadioGroup
                options={[
                  {
                    value: 'assistant-waits-for-user',
                    label: 'Wait for greeting',
                    description: 'The agent waits for the prospect to say hello before speaking. More natural.',
                  },
                  {
                    value: 'assistant-speaks-first',
                    label: 'Speak first',
                    description: 'The agent introduces itself immediately after the call connects.',
                  },
                ]}
                value={settings.firstMessageMode}
                onChange={(v) => update('firstMessageMode', v as AgentSettings['firstMessageMode'])}
              />
            </Field>

            <Field
              label="Screening response"
              hint='What the agent says when asked "Who is calling?" before being connected.'
            >
              <input
                type="text"
                value={settings.screeningResponse}
                onChange={(e) => update('screeningResponse', e.target.value)}
                placeholder="Mitchel Campbell"
                className={inputCls}
              />
            </Field>

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

            <SliderField
              label="Silence timeout"
              hint="Vapi ends the call if there is silence for this long."
              value={settings.silenceTimeoutSeconds}
              min={5}
              max={60}
              step={1}
              format={(v) => `${v}s`}
              onChange={(v) => update('silenceTimeoutSeconds', v)}
            />

            <PromptSectionPreview
              section={getSection('opening')}
              customValue={settings.customPromptOpening}
              onCustomChange={(v) => update('customPromptOpening', v)}
            />

            <PromptSectionPreview
              section={getSection('handling')}
              customValue={settings.customPromptHandling}
              onCustomChange={(v) => update('customPromptHandling', v)}
            />

            <PromptSectionPreview
              section={getSection('rules')}
              customValue={settings.customPromptRules}
              onCustomChange={(v) => update('customPromptRules', v)}
            />
          </Section>

          {/* ── 4. Voicemail Settings ──────────────────────────────────────── */}
          <Section
            title="Voicemail Settings"
            description="What happens when the call goes to voicemail."
          >
            <Field label="Leave voicemail?">
              <Toggle
                checked={settings.voicemailEnabled}
                onChange={(v) => update('voicemailEnabled', v)}
                label="Leave a voicemail message"
              />
            </Field>

            {settings.voicemailEnabled && (
              <>
                <Field
                  label="Voicemail script"
                  hint='Spoken in first person. Use {{contact_name}}, {{industry_description}}, {{geography}} as placeholders.'
                >
                  <textarea
                    rows={4}
                    value={settings.voicemailScript}
                    onChange={(e) => update('voicemailScript', e.target.value)}
                    className={inputCls}
                  />
                </Field>

                <p className="text-xs text-zinc-400">
                  The callback number in the voicemail uses the Company Phone from Agent Identity above.
                </p>
              </>
            )}

            <PromptSectionPreview
              section={getSection('voicemail')}
              customValue={settings.customPromptVoicemail}
              onCustomChange={(v) => update('customPromptVoicemail', v)}
            />
          </Section>

          {/* ── 5. Voice & Audio ────────────────────────────────────────────── */}
          <Section
            title="Voice & Audio"
            description="ElevenLabs voice parameters. Changes apply to the next outbound call."
          >
            <SliderField
              label="Speaking speed"
              hint="1.0 is normal speed. Vapi caps ElevenLabs speed at 1.2x."
              value={settings.voiceSpeed}
              min={0.8}
              max={1.2}
              step={0.05}
              format={(v) => `${v.toFixed(2)}x`}
              onChange={(v) => update('voiceSpeed', v)}
            />

            <SliderField
              label="Voice stability"
              hint="Higher = more consistent. Lower = more expressive."
              value={settings.voiceStability}
              min={0}
              max={1}
              step={0.05}
              format={fmtPercent}
              onChange={(v) => update('voiceStability', v)}
            />

            <SliderField
              label="Similarity boost"
              hint="How closely the voice matches the original clone."
              value={settings.voiceSimilarityBoost}
              min={0}
              max={1}
              step={0.05}
              format={fmtPercent}
              onChange={(v) => update('voiceSimilarityBoost', v)}
            />

            <Field label="ElevenLabs model">
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

            <Field label="Speaker boost" hint="Enhances voice presence and clarity.">
              <Toggle
                checked={settings.useSpeakerBoost}
                onChange={(v) => update('useSpeakerBoost', v)}
                label="Speaker boost"
              />
            </Field>

            <Field label="Background sound" hint="Ambient sound played on the agent's side during the call.">
              <RadioGroup
                options={[
                  { value: 'off', label: 'Off', description: 'Silence -- no background sound.' },
                  { value: 'office', label: 'Office', description: 'Subtle call centre ambience.' },
                  { value: 'custom', label: 'Custom audio URL', description: 'Loop your own audio file.' },
                ]}
                value={settings.backgroundSound === 'off' || settings.backgroundSound === 'office' ? settings.backgroundSound : 'custom'}
                onChange={(v) => update('backgroundSound', v === 'custom' ? '' : v)}
              />
            </Field>

            {settings.backgroundSound !== 'off' && settings.backgroundSound !== 'office' && (
              <Field label="Custom audio URL">
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

          {/* ── 6. Follow-up Email Template ─────────────────────────────────── */}
          <Section
            title="Follow-up Email Template"
            description="Template for follow-up emails when a prospect requests more information. Use {{variable}} placeholders."
          >
            <Field
              label="Email subject"
              hint="Use {{company_name}}, {{contact_name}}, {{agent_name}} as placeholders."
            >
              <input
                type="text"
                value={settings.emailSubjectTemplate}
                onChange={(e) => update('emailSubjectTemplate', e.target.value)}
                placeholder="Following up on our conversation - {{agent_name}} from {{company_name}}"
                className={inputCls}
              />
            </Field>

            <Field
              label="Email body"
              hint="Full email body template. Supports {{company_name}}, {{contact_name}}, {{agent_name}}, {{brokerage_name}}, {{website}}."
            >
              <textarea
                rows={8}
                value={settings.emailBodyTemplate}
                onChange={(e) => update('emailBodyTemplate', e.target.value)}
                className={inputCls}
              />
            </Field>
          </Section>

          {/* ── 7. Inbound / Callback ──────────────────────────────────────── */}
          <Section
            title="Inbound / Callback"
            description="Settings for when a business owner calls back your Vapi number."
          >
            <Field
              label="Call forwarding number"
              hint="Your personal phone number in E.164 format. When a prospect calls back, the call is forwarded here after the whisper plays. This is NOT the number prospects see — they call the Vapi number."
            >
              <input
                type="tel"
                value={settings.forwardingNumber}
                onChange={(e) => update('forwardingNumber', e.target.value)}
                placeholder="+14374943600"
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

            <Field label="If you don't answer...">
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

            <Field label="Enable call whisper?">
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
                      description: 'Company name and call outcome in 2-3 sentences.',
                    },
                    {
                      value: 'detailed',
                      label: 'Detailed',
                      description: 'Full summary -- company name, contact, industry, city, and call outcome.',
                    },
                  ]}
                  value={settings.whisperStyle}
                  onChange={(v) => update('whisperStyle', v as AgentSettings['whisperStyle'])}
                />
              </Field>
            )}
          </Section>

          {/* ── Save button ────────────────────────────────────────────────── */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Settings'}
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
                Failed to save -- please try again
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
              <span className="italic">&quot;Example Company Ltd.&quot;</span> is substituted with the real business at call time.
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
