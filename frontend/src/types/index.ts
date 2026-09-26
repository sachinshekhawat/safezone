/** TypeScript interfaces matching the backend models. */

// ========================
// City
// ========================
export interface City {
  id: string;
  name: string;
  state: string;
  latitude: number;
  longitude: number;
  population?: number;
  literacy_rate?: number;
  female_literacy_rate?: number;
  tier: 'metro' | 'tier1' | 'tier2' | 'tier3';
  created_at: string;
  updated_at: string;
}

// ========================
// Zone
// ========================
export interface Zone {
  id: string;
  city_id: string;
  name: string;
  zone_type: 'residential' | 'commercial' | 'industrial' | 'rural' | 'mixed' | 'institutional';
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
export interface SOSRequest {
  id: string;
  trigger_lat: number;
  trigger_lng: number;
  status: 'active' | 'acknowledged' | 'resolved' | 'false_alarm' | 'escalated';
  trigger_method: 'button' | 'silent' | 'voice' | 'shake';
  nearest_station_name?: string;
  station_distance_km?: number;
  escalation_level: number;
  created_at: string;
  ws_url?: string;
}

export interface LocationUpdate {
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  battery?: number;
  ts: number;
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
}

// ========================
// Auth
// ========================
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'police_officer' | 'analyst' | 'public';
  department?: string;
  is_active: boolean;
}

export interface AuthResponse {
  token: string;
  refresh_token: string;
  user: User;
  expires_at: number;
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
