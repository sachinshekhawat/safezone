/**
 * Domain types mirroring the Go models in backend/internal/models.
 *
 * Shared by the web client and the mobile app so the two cannot drift. When a
 * Go model changes, change it here once.
 */

// ========================
// City
// ========================
export type CityTier = 'metro' | 'tier1' | 'tier2' | 'tier3';

export interface City {
  id: string;
  name: string;
  state: string;
  latitude: number;
  longitude: number;
  population?: number;
  literacy_rate?: number;
  female_literacy_rate?: number;
  tier: CityTier;
  created_at: string;
  updated_at: string;
}

export interface CityListResponse {
  cities: City[];
  total: number;
  page: number;
  limit: number;
}

/** Response from GET /api/v1/public/cities/nearest */
export interface NearestCityResponse {
  city: City;
  distance_km: number;
  zone_count: number;
  within_coverage: boolean;
  coverage_radius_km: number;
}

// ========================
// Zone
// ========================
export type ZoneType =
  | 'residential'
  | 'commercial'
  | 'industrial'
  | 'rural'
  | 'mixed'
  | 'institutional';

export interface Zone {
  id: string;
  city_id: string;
  name: string;
  zone_type: ZoneType;
  latitude: number;
  longitude: number;
  radius_km?: number;
  pin_code?: string;
  city_name?: string;
  created_at: string;
  updated_at: string;
}

export interface ZoneWithRisk extends Zone {
  risk_score?: number;
  risk_level?: RiskLevel;
  incident_count?: number;
  distance_km?: number;
  /**
   * Lighting / policing / CCTV composite, 0-100, higher being better.
   *
   * Drives the time-of-day adjustment in ./time-risk. When absent the model
   * assumes a mid-range value, so an API that omits this field produces an
   * identical night-time uplift for every zone.
   */
  infrastructure_score?: number;
  trend_direction?: 'increasing' | 'decreasing' | 'stable';
}

export interface ZoneListResponse {
  zones: ZoneWithRisk[];
  count: number;
}

// ========================
// Risk
// ========================
export type RiskLevel = 'critical' | 'high' | 'moderate' | 'low' | 'very_low';

export interface RiskScore {
  id: string;
  zone_id: string;
  overall_score: number;
  risk_level: RiskLevel;
  incident_frequency_score: number;
  recency_score: number;
  demographic_risk_score: number;
  infrastructure_score: number;
  trend_score: number;
  trend_direction?: 'increasing' | 'decreasing' | 'stable';
  calculated_for_month: number;
  calculated_for_year: number;
}

// ========================
// SOS
// ========================
export type SOSStatus = 'active' | 'acknowledged' | 'resolved' | 'false_alarm' | 'escalated';
export type SOSTriggerMethod = 'button' | 'silent' | 'voice' | 'shake';

export interface SOSRequest {
  id: string;
  trigger_lat: number;
  trigger_lng: number;
  status: SOSStatus;
  trigger_method: SOSTriggerMethod;
  nearest_station_name?: string;
  station_distance_km?: number;
  escalation_level: number;
  created_at: string;
  ws_url?: string;
}

/** Response body from POST /api/v1/sos/trigger */
export interface SOSTriggerResponse {
  sos: SOSRequest;
  nearest_station: string;
  station_distance_km: string;
  ws_url: string;
  message: string;
}

/**
 * One location sample.
 *
 * `ts` is epoch milliseconds. Mobile background tasks buffer these and flush
 * them in batches to POST /api/v1/sos/{id}/locations, because a WebSocket does
 * not survive the app being backgrounded.
 */
export interface LocationUpdate {
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  battery?: number;
  ts: number;
}

/** Response body from POST /api/v1/sos/{id}/locations */
export interface LocationBatchResponse {
  accepted: number;
  rejected: number;
  status: SOSStatus;
}

// ========================
// Chat
// ========================
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ChatResponse {
  session_id: string;
  message: string;
  tools_used: string[];
  metadata?: {
    grounded?: boolean;
    zones_matched?: string[];
  } | null;
}

// ========================
// Auth
// ========================
export type UserRole = 'admin' | 'police_officer' | 'analyst' | 'public';

/** Self-declared gender. `prefer_not_to_say` is always an option. */
export type Gender = 'female' | 'male' | 'other' | 'prefer_not_to_say';

export type AuthProvider = 'password' | 'phone_otp' | 'google';

export interface User {
  id: string;
  /** Absent for citizens who signed up with a phone number only. */
  email?: string;
  name: string;
  role: UserRole;
  /** E.164, e.g. +919812345678. */
  phone?: string;
  phone_verified_at?: string;
  gender?: Gender;
  /** Home city, used to pick which zone data to show first. */
  city_id?: string;
  auth_provider: AuthProvider;
  avatar_url?: string;
  /** ISO timestamps. Absent means no consent on file for that purpose. */
  consent_data_at?: string;
  consent_location_at?: string;
  consent_version?: string;
  department?: string;
  is_active: boolean;
}

export interface AuthResponse {
  token: string;
  refresh_token: string;
  user: User;
  expires_at: number;
  /** False when onboarding still needs a city, name or consent. */
  profile_complete: boolean;
  /** Lets the UI say "Welcome" vs "Welcome back". */
  is_new_user: boolean;
}

/** Response from POST /api/v1/auth/phone/otp */
export interface OTPRequestResponse {
  sent: boolean;
  expires_in_secs: number;
  retry_after_secs: number;
  /**
   * Present only when the server has no SMS provider configured, so the flow
   * can be walked through in development. Never present in production.
   */
  dev_code?: string;
}

/**
 * Response from POST /api/v1/auth/phone/verify.
 *
 * A verified number with no account is a success, not an error: the client's
 * next step is the profile form. Discriminated on `registered` so the caller
 * cannot read `token` off an unregistered response by accident.
 */
export type OTPVerifyResponse =
  | ({ registered?: true } & AuthResponse)
  | { registered: false; phone: string; profile_complete: false };

export interface PhoneRegisterPayload {
  phone: string;
  code: string;
  name: string;
  gender: Gender;
  city_id: string;
  consent_data: boolean;
  consent_location: boolean;
}

export interface ProfileUpdatePayload {
  name?: string;
  gender?: Gender;
  city_id?: string;
  consent_data?: boolean;
  consent_location?: boolean;
}

// ========================
// API
// ========================
export interface APIError {
  code: number;
  message: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
