// ─── Call / Business types (localStorage) ──────────────────────────────────

export type CallStatus =
  | 'pending'
  | 'researched'
  | 'approved'
  | 'calling'
  | 'called-interested'
  | 'called-maybe'
  | 'called-not-interested'
  | 'called-left-voicemail'
  | 'called-no-answer'
  | 'called-wrong-contact'
  | 'called-send-info'
  | 'callback-received'
  | 'failed'
  | 'no-phone';

export interface CallHistoryEntry {
  callId: string;
  timestamp: string;
  outcome: string;
  transcript: string | null;
  recordingUrl: string | null;
  duration: number | null;
  notes: string;
}

export interface Business {
  id: string;
  searchSessionId: string;
  createdAt: string;
  // Business info
  companyName: string;
  contactName: string;
  phone: string | null;
  email: string;
  city: string;
  industry: string;
  description: string;
  notes: string;
  placeId: string;
  // Call state
  callId: string | null;
  callStatus: CallStatus;
  // Results
  transcript: string | null;
  recordingUrl: string | null;
  // Research
  researchNotes: string;
  talkingPoints: string;
  // Call history
  callHistory: CallHistoryEntry[];
  // Follow-up
  followUpDate: string | null;
  emailSent: boolean;
  // Last call error (shown on card when callStatus === 'failed')
  callError?: string | null;
}

export interface SearchSession {
  id: string;
  createdAt: string;
  location: string;
  radius: number;
  maxBusinesses: number;
  businessType: string;
  source: 'search' | 'csv';
}

export interface SearchFormValues {
  location: string;
  radius: number;
  maxBusinesses: number;
  businessType: string;
}

// ─── CSV Upload ──────────────────────────────────────────────────────────────

export interface CsvUploadRow {
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  city: string;
  industry: string;
  description: string;
  notes: string;
}

// ─── Inbound types (Vercel KV / Upstash Redis) ─────────────────────────────

export interface WhisperContext {
  businessId: string;
  companyName: string;
  contactName: string;
  city: string;
  industry: string;
  callOutcome: string;
  outboundCallId: string;
  savedAt: string;
}

export interface Voicemail {
  id: string;
  businessPhone: string;
  businessName: string | null;
  businessId: string | null;
  callId: string;
  recordingUrl: string | null;
  transcript: string | null;
  receivedAt: string;
  reviewed: boolean;
}

// ─── API request / response shapes ──────────────────────────────────────────

export interface SearchApiRequest {
  location: string;
  radius: number;
  maxBusinesses: number;
  businessType: string;
}

export interface SearchApiBusiness {
  name: string;
  address: string;
  phone: string | null;
  placeId: string;
  website?: string | null;
}

export interface SearchApiResponse {
  businesses: SearchApiBusiness[];
  error?: string;
}

export interface CallStartRequest {
  businessId: string;
  companyName: string;
  contactName: string;
  phone: string;
  city: string;
  industry: string;
  description: string;
  researchNotes: string;
  talkingPoints: string;
}

export interface CallStartResponse {
  callId?: string;
  error?: string;
}

export interface CallStatusResponse {
  callId?: string;
  status?: CallStatus;
  transcript?: string | null;
  recordingUrl?: string | null;
  endedReason?: string | null;
  error?: string;
}

export interface PlaceSuggestion {
  placeId: string;
  name: string;
  address: string;
}

export interface PlacesAutocompleteResponse {
  places: PlaceSuggestion[];
  error?: string;
}

export interface BusinessResearchRequest {
  businessId: string;
  companyName: string;
  address: string;
  placeId: string;
  industry: string;
}

export interface BusinessResearchResponse {
  status: 'complete' | 'no-info';
  researchNotes: string;
  suggestedTalkingPoints: string[];
  sourceUrl: string | null;
  error?: string;
}

export type CallOutcome =
  | 'interested'
  | 'maybe'
  | 'not-interested'
  | 'wrong-contact'
  | 'send-info'
  | 'left-voicemail'
  | 'no-answer';

export interface AnalyseCallRequest {
  businessId: string;
  companyName: string;
  contactName: string;
  phone: string;
  transcript: string;
}

export interface AnalyseCallResponse {
  outcome: CallOutcome;
  notes: string;
  followUpDate: string | null;
  emailRequested: boolean;
  error?: string;
}

// ─── Agent Settings (stored in Redis) ───────────────────────────────────────

export interface AgentSettings {
  // ── Agent Identity ─────────────────────────────────────────────────────────
  agentName: string;
  companyName: string;
  companyPhone: string;
  companyWebsite: string;

  // ── Buyer Profile ──────────────────────────────────────────────────────────
  buyerDescription: string;
  targetIndustries: string[];
  revenueRange: string;
  ebitdaRange: string;
  geography: string;
  maxPurchasePrice: string;

  // ── Call Behavior ──────────────────────────────────────────────────────────
  firstMessageMode: 'assistant-waits-for-user' | 'assistant-speaks-first';
  screeningResponse: string;
  maxCallDurationSeconds: number;    // 60–600
  silenceTimeoutSeconds: number;     // 5–60

  // ── Voicemail ──────────────────────────────────────────────────────────────
  voicemailEnabled: boolean;
  voicemailScript: string;
  callbackNumber: string;

  // ── Voice & Audio ──────────────────────────────────────────────────────────
  voiceSpeed: number;                // 0.8–1.2
  voiceStability: number;            // 0–1 (ElevenLabs)
  voiceSimilarityBoost: number;      // 0–1 (ElevenLabs)
  elevenLabsModel: 'eleven_turbo_v2_5' | 'eleven_multilingual_v2' | 'eleven_turbo_v2';
  useSpeakerBoost: boolean;
  backgroundSound: string;           // 'off' or custom audio URL

  // ── Follow-up Email Template ───────────────────────────────────────────────
  emailSubjectTemplate: string;
  emailBodyTemplate: string;

  // ── Custom Prompt Overrides ────────────────────────────────────────────────
  customPromptIdentity: string;
  customPromptBuyer: string;
  customPromptOpening: string;
  customPromptHandling: string;
  customPromptRules: string;
  customPromptVoicemail: string;

  // ── Inbound / Callback ─────────────────────────────────────────────────────
  whisperEnabled: boolean;
  whisperStyle: 'brief' | 'detailed';
  forwardingNumber: string;          // E.164
  ringTimeoutSeconds: number;        // 10–30
  fallbackBehaviour: 'voicemail' | 'agent' | 'hang-up';

  // ── Metadata ───────────────────────────────────────────────────────────────
  updatedAt: string;
}

// ─── Prompt Section (used by per-section preview in Settings) ───────────────

export interface PromptSection {
  id: 'identity' | 'buyer' | 'opening' | 'handling' | 'rules' | 'voicemail';
  title: string;
  autoContent: string;
  customContent: string;
}
