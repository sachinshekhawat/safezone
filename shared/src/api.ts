/**
 * Transport-agnostic API client.
 *
 * Uses only `fetch`, which exists in browsers and in React Native, so the web
 * client and the mobile app talk to the backend through the same code path and
 * the same types.
 */

import type {
  AuthResponse,
  ChatResponse,
  CityListResponse,
  LocationBatchResponse,
  LocationUpdate,
  NearestCityResponse,
  OTPRequestResponse,
  OTPVerifyResponse,
  PhoneRegisterPayload,
  ProfileUpdatePayload,
  SOSTriggerResponse,
  User,
  ZoneListResponse,
} from './types';

export interface ApiClientOptions {
  /** Base URL of the Go gateway, e.g. http://localhost:8080 */
  baseUrl: string;
  /** Base URL of the Python AI service, e.g. http://localhost:8090 */
  aiUrl?: string;
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class SafeZoneApi {
  private token: string | null = null;

  constructor(private readonly options: ApiClientOptions) {}

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(path: string, init: RequestInit = {}, base?: string): Promise<T> {
    const url = `${base ?? this.options.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((init.headers as Record<string, string>) ?? {}),
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    // Mobile networks stall rather than fail, so always bound the wait.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 15_000);

    try {
      const response = await fetch(url, { ...init, headers, signal: controller.signal });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new ApiError(response.status, body?.message ?? `HTTP ${response.status}`);
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  // ---- Auth ----

  login(email: string, password: string) {
    return this.request<AuthResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  register(email: string, password: string, name: string) {
    return this.request<AuthResponse>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
  }

  // ---- Auth: phone OTP (citizens) ----

  /**
   * Ask for a verification code.
   *
   * The server throttles by number, so a 429 here is an expected outcome — the
   * caller should surface `retry_after_secs` rather than treating it as a fault.
   */
  requestOTP(phone: string) {
    return this.request<OTPRequestResponse>('/api/v1/auth/phone/otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  }

  /**
   * Submit a code.
   *
   * Returns tokens when the number already has an account, or
   * `{ registered: false }` when the caller should continue to the profile form
   * with the same code.
   */
  verifyOTP(phone: string, code: string) {
    return this.request<OTPVerifyResponse>('/api/v1/auth/phone/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
    });
  }

  /** Create a citizen account. Requires `consent_data` to be true. */
  registerWithPhone(payload: PhoneRegisterPayload) {
    return this.request<AuthResponse>('/api/v1/auth/phone/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // ---- Auth: Google ----

  /** Whether this server has Google credentials; hide the button when false. */
  googleEnabled() {
    return this.request<{ enabled: boolean }>('/api/v1/auth/google/status');
  }

  /**
   * Sign in *or* sign up with a Google ID token — the server decides which.
   *
   * Pass the profile fields when they are already known so a new account is
   * complete in one call; omit them and check `profile_complete` on the
   * response to know whether onboarding is still needed.
   */
  signInWithGoogle(idToken: string, profile?: Omit<ProfileUpdatePayload, 'name'>) {
    return this.request<AuthResponse>('/api/v1/auth/google', {
      method: 'POST',
      body: JSON.stringify({ id_token: idToken, ...profile }),
    });
  }

  // ---- Auth: profile ----

  /** The authenticated user. Requires setToken() first. */
  getMe() {
    return this.request<User>('/api/v1/auth/me');
  }

  /**
   * Fill in remaining onboarding fields.
   *
   * Consent can only be granted here; omitting a consent field leaves any
   * existing record intact rather than revoking it.
   */
  updateProfile(payload: ProfileUpdatePayload) {
    return this.request<User>('/api/v1/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  // ---- Cities & zones ----

  getCities(page = 1, limit = 100) {
    return this.request<CityListResponse>(`/api/v1/public/cities?page=${page}&limit=${limit}`);
  }

  /** Resolve the device's coordinates to the closest monitored city. */
  getNearestCity(lat: number, lng: number) {
    return this.request<NearestCityResponse>(
      `/api/v1/public/cities/nearest?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`,
    );
  }

  getZonesByCity(cityId: string) {
    return this.request<ZoneListResponse>(`/api/v1/public/zones/city/${cityId}`);
  }

  getNearbyZones(lat: number, lng: number, radiusKm = 10) {
    return this.request<ZoneListResponse>('/api/v1/public/zones/nearby', {
      method: 'POST',
      body: JSON.stringify({ latitude: lat, longitude: lng, radius_km: radiusKm }),
    });
  }

  // ---- SOS ----

  triggerSOS(lat: number, lng: number, deviceId?: string) {
    return this.request<SOSTriggerResponse>('/api/v1/sos/trigger', {
      method: 'POST',
      body: JSON.stringify({
        latitude: lat,
        longitude: lng,
        device_id: deviceId,
        trigger_method: 'button',
      }),
    });
  }

  /**
   * Flush buffered location points for an active SOS.
   *
   * This is the path a mobile background task uses: it wakes up, drains its
   * buffer, and POSTs. Do not rely on a WebSocket for this — sockets are closed
   * when the app is backgrounded, which is exactly when SOS matters.
   */
  syncSOSLocations(sosId: string, points: LocationUpdate[]) {
    return this.request<LocationBatchResponse>(`/api/v1/sos/${sosId}/locations`, {
      method: 'POST',
      body: JSON.stringify({ points }),
    });
  }

  // ---- AI advisor ----

  sendChatMessage(message: string, agentType = 'advisor', sessionId?: string, context?: unknown) {
    if (!this.options.aiUrl) {
      throw new Error('aiUrl was not configured on the API client');
    }
    return this.request<ChatResponse>(
      '/api/v1/agents/chat',
      {
        method: 'POST',
        body: JSON.stringify({
          message,
          agent_type: agentType,
          session_id: sessionId,
          context,
        }),
      },
      this.options.aiUrl,
    );
  }
}
