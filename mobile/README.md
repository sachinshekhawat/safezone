# SafeZone India — Mobile (Expo / React Native)

Expo SDK 57 · React Native 0.86 · New Architecture enabled · Material Design 3 via
React Native Paper.

Shares types, risk banding and the API client with the web client through
[`@safezone/shared`](../shared), so the two clients cannot drift apart.

## Running it

The backend must be reachable first:

```bash
# from the repo root
make backend        # :8080
cd ai-service && venv/bin/uvicorn app.main:app --port 8090   # advisor chat
```

Then:

```bash
cd mobile
npm install
npx expo start      # press i for iOS simulator, a for Android
```

Scan the QR code with Expo Go to run on a physical phone.

### Talking to the backend from a device

`localhost` on a phone or emulator means the phone, not your Mac. `src/lib/api.ts`
handles this: in development it rewrites `localhost` to the LAN host Expo is
already serving the bundle from, and falls back to `10.0.2.2` on Android
emulators. Override explicitly by editing `extra.apiUrl` / `extra.aiUrl` in
`app.json`.

## Screens

| Route | Purpose |
|---|---|
| `app/(auth)/sign-in.tsx` | Mobile number entry, plus Continue with Google |
| `app/(auth)/verify.tsx` | 6-digit OTP, auto-submits on the last digit |
| `app/(auth)/profile.tsx` | Name, gender, city and the two consent checkboxes |
| `app/(tabs)/index.tsx` | Zones for the current city — map of risk bubbles or ranked list |
| `app/(tabs)/sos.tsx` | Emergency SOS with batched location streaming |
| `app/(tabs)/advisor.tsx` | Chat with the data-grounded safety advisor |

## Sign-in

Citizens sign in with a phone number and a 6-digit code; staff continue to use
email and password against the same `users` table.

**With no SMS provider configured the server returns the code in its response**
and the verify screen displays it, so the flow is walkable locally. Set
`SMS_PROVIDER` to switch to a real sender — note that transactional SMS in India
needs DLT registration with a pre-approved template, so the provider must be one
that supports it (MSG91, Gupshup, Kaleyra).

Tokens are stored with `expo-secure-store` (iOS Keychain / Android Keystore), not
AsyncStorage. On the web dev target they fall back to `sessionStorage` — see
`src/lib/token-store.web.ts` for why that is a development convenience only.

### Consent

Registration will not complete without the data-processing consent, and the
server records *when* consent was given and against which policy version rather
than a bare boolean — a boolean cannot evidence what was agreed to. Location
consent is separate and optional; declining it leaves the app fully usable with
manual city selection. Neither box is pre-ticked.

### Google sign-in

One button handles both sign-in and sign-up: the server looks the account up and
reports `is_new_user`, so there is no wrong button to pick. The client obtains a
Google **ID token** and the gateway verifies its signature against Google's JWKS,
checking issuer, expiry and audience. Two things are needed to turn it on:

1. OAuth client IDs in `app.json` under `extra.googleIosClientId` /
   `googleAndroidClientId` / `googleWebClientId`, and the matching
   `GOOGLE_*_CLIENT_ID` values in the backend environment.
2. **A development build.** Google rejects the `exp://` redirect URI that Expo Go
   would have to use, and Expo's auth proxy that used to work around this has
   been removed. Run `npx expo run:ios` or build with EAS.

Until both are in place the button is disabled with the reason shown underneath,
and `GET /api/v1/auth/google/status` reports `{"enabled": false}`.

## The zone map

`react-native-maps` is bundled in Expo Go on SDK 57, so the map works with no
native build and no API key on iOS, where it renders through Apple Maps. Android
uses Google Maps, which needs a key **only for a store binary** — Expo Go and
development builds do not. Add it under
`plugins.react-native-maps.androidGoogleMapsApiKey` before shipping to Play.

Bubble radius follows each zone's real `radius_km`, floored at 900 m so small
zones stay legible and tappable. Risk is encoded as **fill opacity and colour,
not size**: scaling the radius by score would imply the affected *area* is
larger, which is a claim about geography the data does not make. The numeric
badge grows slightly with the score so high-risk zones draw the eye first.

There is no map on the web target — `react-native-maps` wraps MapKit and the
Google Maps SDK and has no browser implementation. `src/components/zone-map.web.tsx`
renders an explanatory placeholder, which Metro picks automatically, and the
Leaflet heat map in `../frontend` covers the browser case.

## Location permissions

Foreground location is requested on first launch via a banner that explains why,
and the city switcher is always available as a fallback so a denied permission
never leaves the app unusable.

Background ("Always") location is **not** requested at launch. It is only
meaningful once an SOS is active, and both app stores scrutinise blanket
background-location requests. Permission strings for both are already declared in
`app.json`.

## SOS location sync

While an SOS is active the app samples position every 5s and flushes batches to
`POST /api/v1/sos/{id}/locations`. It deliberately does **not** use the WebSocket
for this: sockets are torn down when the app is backgrounded, which is exactly
when an SOS matters. Failed uploads stay buffered and retry on the next tick, so a
dropped connection delays the trail rather than losing it.

## Not done yet

- **True background location.** The 5s loop above only runs while the app is
  foregrounded. Surviving backgrounding needs
  `react-native-background-geolocation` (commercially licensed) or a custom
  foreground-service module, plus handling of the aggressive battery managers
  Xiaomi/Oppo/Vivo/Samsung ship.
- **Push notifications** for SOS escalation to police.
- **A real SMS provider.** OTPs are logged, not sent, until `SMS_PROVIDER` is
  wired to a DLT-registered gateway.
- **Consent withdrawal UI.** The backend records consent per purpose so either
  can be withdrawn independently, and `PATCH /api/v1/auth/me` exists, but there
  is no profile screen yet that exposes it.
- **Zone clustering.** Where zones sit close together their score badges
  overlap at city zoom. Collapsing them into a cluster badge below a zoom
  threshold is the fix.
