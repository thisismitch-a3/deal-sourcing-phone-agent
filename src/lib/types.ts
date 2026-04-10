// ─── Call / Restaurant types (localStorage) ──────────────────────────────────

export type CallStatus = 'pending' | 'calling' | 'complete' | 'failed' | 'no-phone';

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
  // User decisions
  confirmed: boolean;
  notSuitable: boolean;
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

  // Metadata
  updatedAt: string;
}
