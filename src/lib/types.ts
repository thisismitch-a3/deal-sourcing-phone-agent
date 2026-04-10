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
  // Identity
  ownerName: string;           // "Mitchel Campbell" — used in introductions
  openingLine: string;         // First spoken message when the call connects

  // Dietary restrictions
  dietaryRestrictions: string; // Comma-separated, e.g. "garlic, soy"
  crossContaminationOk: boolean;
  restrictionNotes: string;    // Optional extra context for the agent

  // Call behaviour
  maxCallDurationSeconds: number; // 60–600
  callStyle: 'brief' | 'thorough';
  endCallIfUnableToHelp: boolean;

  // Whisper (inbound callbacks)
  whisperEnabled: boolean;
  whisperStyle: 'brief' | 'detailed';

  // Voicemail handling (outbound — when restaurant doesn't answer)
  voicemailBehaviour: 'hang-up' | 'leave-message';
  voicemailScript: string; // Placeholders: {restaurantName}, {ownerName}

  // Menu research (pre-call)
  menuResearchEnabled: boolean;
  menuResearchMaxDishes: number;    // 2–4
  menuResearchConfidenceThreshold: 'low' | 'medium' | 'high';

  // Metadata
  updatedAt: string;
}
