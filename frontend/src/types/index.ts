/**
 * Domain types for the web client.
 *
 * These are re-exported from @safezone/shared rather than declared here. This
 * file previously held its own 137-line copy of City, Zone, RiskLevel, SOS and
 * chat interfaces, maintained in parallel with the mobile app's copy — which is
 * precisely the drift the shared package was created to stop. A field added to a
 * Go model had to be mirrored in two TypeScript files, and nothing failed if you
 * only remembered one.
 *
 * Kept as a file (rather than deleting it and rewriting every import) so the
 * existing `@/types` imports across the app continue to resolve.
 */

export type {
  APIError,
  AuthProvider,
  AuthResponse,
  ChatMessage,
  ChatResponse,
  City,
  CityListResponse,
  CityTier,
  Gender,
  Helpline,
  HelplineAudience,
  LocationBatchResponse,
  LocationUpdate,
  NearestCityResponse,
  OTPRequestResponse,
  OTPVerifyResponse,
  PaginatedResponse,
  PhoneRegisterPayload,
  ProfileUpdatePayload,
  ProfiledRisk,
  RiskBand,
  RiskLevel,
  RiskProfile,
  RiskScore,
  SOSRequest,
  SOSStatus,
  SOSTriggerMethod,
  SOSTriggerResponse,
  TimeAdjustedRisk,
  TimeBand,
  TimeBandDef,
  TimeRiskFactor,
  User,
  UserRole,
  Zone,
  ZoneListResponse,
  ZoneType,
  ZoneWithRisk,
} from '@safezone/shared';
