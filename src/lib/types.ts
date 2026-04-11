// ─── Call / Restaurant types (localStorage) ──────────────────────────────────

export type CallStatus =
  | 'pending'
  | 'researching'
  | 'awaiting-approval'
  | 'approved'
  | 'no-menu'
  | 'calling'
  | 'complete'
  | 'failed'
  | 'no-phone';

export interface SuggestedDish {
  id: string;
  name: string;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  approved: boolean;
}

export interface Restaurant {
  id: string;
  searchSessionId: string;
  createdAt: string;
  // Google Places data
  name: string;
  address: string;
  rating: number | null;
  phone: string | null;
  placeId: string;
  // Call state
  callId: string | null;
  callStatus: CallStatus;
  // Results
  transcript: string | null;
  recordingUrl: string | null;
  safeMenuOptions: string[];
  // Menu research
  suggestedDishes: SuggestedDish[];
  // User decisions
  confirmed: boolean;
  notSuitable: boolean;
  // Last call error (shown on card when callStatus === 'failed')
  callError?: string | null;
}

export interface SearchSession {
  id: string;
  createdAt: string;
  location: string;
  radius: number;
  minRating: number;
  maxRestaurants: number;
  cuisineType: string;
  dietaryRestrictions: string;
  whatToAsk: 'general' | 'specific-dish';
  specificDish: string;
}

export interface SearchFormValues {
  location: string;
  radius: number;
  minRating: number;
  maxRestaurants: number;
  cuisineType: string;
  dietaryRestrictions: string;
  whatToAsk: 'general' | 'specific-dish';
  specificDish: string;
}

// ─── Menu research types ──────────────────────────────────────────────────────

export interface MenuResearch {
  restaurantId: string;
  restaurantName: string;
  sourceUrl: string | null;
  rawMenuText: string | null;
  suggestedDishes: SuggestedDish[];
  researchedAt: string;
}

// ─── Inbound types (Vercel KV / Upstash Redis) ───────────────────────────────

export interface WhisperContext {
  restaurantId: string;
  restaurantName: string;
  address: string;
  neighborhood: string;
  rating: number | null;
  safeMenuOptions: string[];
  dietaryRestrictions: string;
  outboundCallId: string;
  savedAt: string;
}

export interface Voicemail {
  id: string;
  restaurantPhone: string;
  restaurantName: string | null;
  restaurantId: string | null;
  callId: string;
  recordingUrl: string | null;
  transcript: string | null;
  receivedAt: string;
  reviewed: boolean;
}

// ─── API request / response shapes ───────────────────────────────────────────

export interface SearchApiRequest {
  location: string;
  radius: number;
  minRating: number;
  maxRestaurants: number;
  cuisineType: string;
}

export interface SearchApiRestaurant {
  name: string;
  address: string;
  rating: number | null;
  phone: string | null;
  placeId: string;
}

export interface SearchApiResponse {
  restaurants: SearchApiRestaurant[];
  error?: string;
}

export interface CallStartRequest {
  restaurantId: string;
  restaurantName: string;
  phone: string;
  address: string;
  rating: number | null;
  dietaryRestrictions: string;
  specificDish: string;
  approvedDishes?: SuggestedDish[];
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
  endedReason?: string | null;   // raw Vapi endedReason — shown as callError when failed
  error?: string;
}

export interface PlaceSuggestion {
  placeId: string;
  name: string;
  address: string;
  rating: number | null;
}

export interface PlacesAutocompleteResponse {
  places: PlaceSuggestion[];
  error?: string;
}

export interface MenuResearchRequest {
  restaurantId: string;
  restaurantName: string;
  address: string;
  placeId: string;
  dietaryRestrictions: string;
  specificDish: string;
}

export interface MenuResearchResponse {
  status: 'complete' | 'no-menu';
  suggestedDishes: SuggestedDish[];
  sourceUrl: string | null;
  error?: string;
}

export interface SummariseRequest {
  restaurantId: string;
  restaurantName: string;
  phone: string;
  transcript: string;
  dietaryRestrictions: string;
}

export interface SummariseResponse {
  safeMenuOptions: string[];
  error?: string;
}

// ─── Agent Settings (stored in Redis) ────────────────────────────────────────

export interface AgentSettings {
  // ── Identity & Introduction ─────────────────────────────────────────────────
  ownerName: string;
  openingLine: string;
  callerTone: 'professional' | 'friendly' | 'casual';

  // ── Dietary Restrictions & Conversation ────────────────────────────────────
  dietaryRestrictions: string;
  crossContaminationOk: boolean;
  restrictionNotes: string;
  dishPreferences: string;
  uncertaintyBehaviour: 'accept' | 'escalate' | 'ask-again';

  // ── Call Behaviour ──────────────────────────────────────────────────────────
  maxCallDurationSeconds: number;   // 60–600
  callStyle: 'brief' | 'thorough';
  endCallIfUnableToHelp: boolean;
  silenceTimeoutSeconds: number;    // 5–30
  holdBehaviour: 'wait' | 'hang-up';
  maxRetries: number;               // 0–3
  retryDelayMinutes: number;        // 5–120

  // ── Voice & Audio ───────────────────────────────────────────────────────────
  voiceStability: number;           // 0–1 (ElevenLabs)
  voiceSimilarityBoost: number;     // 0–1 (ElevenLabs)
  voiceSpeed: number;               // 0.5–2.0
  voiceStyle: number;               // 0–1 (ElevenLabs)
  fillerWordsEnabled: boolean;
  backgroundDenoisingEnabled: boolean;

  // ── Inbound / Callback ──────────────────────────────────────────────────────
  whisperEnabled: boolean;
  whisperStyle: 'brief' | 'detailed';
  forwardingNumber: string;         // E.164
  ringTimeoutSeconds: number;       // 10–30
  fallbackBehaviour: 'voicemail' | 'agent' | 'hang-up';

  // ── Voicemail handling (outbound) ───────────────────────────────────────────
  voicemailBehaviour: 'hang-up' | 'leave-message';
  voicemailScript: string;          // Placeholders: {restaurantName}, {ownerName}

  // ── Menu Research ───────────────────────────────────────────────────────────
  menuResearchEnabled: boolean;
  menuResearchMaxDishes: number;    // 2–4
  menuResearchConfidenceThreshold: 'low' | 'medium' | 'high';

  // ── Notifications ───────────────────────────────────────────────────────────
  notifyOnCallComplete: boolean;
  notifyEmail: string;
  notifyOnMissedCallback: boolean;
  webhookUrl: string;

  // ── Dashboard Defaults ──────────────────────────────────────────────────────
  defaultSearchRadius: number;      // 1–20 km
  defaultMinRating: number;         // 0–5 in 0.5 steps
  defaultCuisineType: string;
  defaultMaxRestaurants: number;    // 5–20
  autoStartCalls: boolean;

  // ── Metadata ────────────────────────────────────────────────────────────────
  updatedAt: string;
}
