/** API client with authentication and error handling. */

import type { LocationUpdate } from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

class APIClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Auth
  async login(email: string, password: string) {
    return this.request<any>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async register(email: string, password: string, name: string) {
    return this.request<any>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
  }

  // Cities
  async getCities(page = 1, limit = 20) {
    return this.request<any>(`/api/v1/public/cities?page=${page}&limit=${limit}`);
  }

  async getCity(id: string) {
    return this.request<any>(`/api/v1/public/cities/${id}`);
  }

  /** Resolve a coordinate pair to the closest monitored city. */
  async getNearestCity(lat: number, lng: number) {
    return this.request<any>(
      `/api/v1/public/cities/nearest?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`,
    );
  }

  // Zones
  async getZonesByCity(cityId: string) {
    return this.request<any>(`/api/v1/public/zones/city/${cityId}`);
  }

  async getNearbyZones(lat: number, lng: number, radiusKm: number = 10) {
    return this.request<any>('/api/v1/public/zones/nearby', {
      method: 'POST',
      body: JSON.stringify({ latitude: lat, longitude: lng, radius_km: radiusKm }),
    });
  }

  async getZoneRisk(zoneId: string) {
    return this.request<any>(`/api/v1/public/zones/${zoneId}/risk`);
  }

  // SOS
  async triggerSOS(lat: number, lng: number, deviceId?: string) {
    return this.request<any>('/api/v1/sos/trigger', {
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
   * Flush a batch of location points for an active SOS.
   *
   * The WebSocket is used for the live view, but it dies when a mobile app is
   * backgrounded. This endpoint is the durable path that background location
   * tasks use, and the web client falls back to it if the socket drops.
   */
  async syncSOSLocations(sosId: string, points: LocationUpdate[]) {
    return this.request<any>(`/api/v1/sos/${sosId}/locations`, {
      method: 'POST',
      body: JSON.stringify({ points }),
    });
  }

  // Chat (AI Service)
  async sendChatMessage(message: string, agentType: string, sessionId?: string, context?: any) {
    const AI_URL = process.env.NEXT_PUBLIC_AI_URL || 'http://localhost:8090';
    const response = await fetch(`${AI_URL}/api/v1/agents/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        agent_type: agentType,
        session_id: sessionId,
        context,
      }),
    });
    return response.json();
  }
}

export const api = new APIClient();
export default api;
