/**
 * eturistaService.ts
 *
 * All HTTP calls that talk to the eTurista CIS go through the local Express
 * server proxy (server.ts), which in turn calls the real eTurista API.
 * This keeps credentials and tokens server-side and avoids CORS issues.
 */

import { GuestData } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EturistaAuth {
  /** JWT Bearer token — add as  Authorization: Bearer <token>  */
  token: string;
  refreshToken: string;
  id: number;
}

export interface CheckinResult {
  success: boolean;
  /** Stable local identifier — MUST be stored and passed to checkout */
  externalId: string;
  /** eTurista internal identifier returned by the CIS */
  eturistaIdentifikator: string;
  message?: string;
  warnings?: string;
}

export interface CheckoutResult {
  success: boolean;
  message?: string;
  warnings?: string;
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function loginToETurista(username: string, password: string, environment: 'test' | 'prod' = 'test'): Promise<EturistaAuth> {
  const res = await fetch("/api/eturista/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Environment": environment },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Login failed" }));
    throw new Error((err as any).error || "Login failed");
  }

  const data: any = await res.json();
  return {
    token: data.sessionToken,
    refreshToken: data.refreshToken,
    id: data.userId,
  };
}

// ─── Token Refresh ────────────────────────────────────────────────────────────

export async function refreshToken(token: string, refreshTokenValue: string, environment: 'test' | 'prod' = 'test'): Promise<EturistaAuth> {
  const res = await fetch(`/api/eturista/refresh-token`, {
    headers: {
      Authorization: token,
      RefreshToken: refreshTokenValue,
      "X-Environment": environment
    },
  });

  if (!res.ok) throw new Error("Token refresh failed");
  const data: any = await res.json();
  return { token: data.sessionToken, refreshToken: data.refreshToken, id: data.userId };
}

// ─── Accommodations ───────────────────────────────────────────────────────────

export async function getSmeštajneJedinice(
  token: string,
  userId: number,
  environment: 'test' | 'prod' = 'test'
): Promise<{ id: number; name: string; address: string; type: string }[]> {
  const res = await fetch(`/api/eturista/accommodations?userId=${userId}`, {
    headers: { Authorization: token, "X-Environment": environment },
  });
  if (!res.ok) throw new Error("Failed to load accommodations");
  return res.json();
}

// ─── Check-in ─────────────────────────────────────────────────────────────────
// Maps the frontend GuestData model → the server expects the same shape.
// The server then builds the correct eTurista payload (OsnovniPodaci / PodaciOBoravku).

export async function submitToETurista(
  guest: GuestData,
  sessionToken: string,
  accommodationId: number,
  environment: 'test' | 'prod' = 'test'
): Promise<CheckinResult> {
  const res = await fetch("/api/eturista/checkin", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: sessionToken,
      "X-Environment": environment
    },
    body: JSON.stringify({ guest, accommodationId }),
  });

  const data: any = await res.json();

  if (!res.ok) {
    return {
      success: false,
      externalId: "",
      eturistaIdentifikator: "",
      message: data.details || data.error || "Check-in failed",
    };
  }

  return {
    success: true,
    externalId: data.externalId,
    eturistaIdentifikator: data.eturistaIdentifikator || "",
    message: data.message,
    warnings: data.warnings,
  };
}

// ─── Check-out ────────────────────────────────────────────────────────────────

export async function checkoutFromETurista(
  sessionToken: string,
  externalId: string,
  accommodationId: number | string,
  checkoutDateTime: string,  // "YYYY-MM-DD HH:mm"
  numberOfNights?: number,   // required for legal entities; omit/null for physical persons
  isAmendment = false,
  environment: 'test' | 'prod' = 'test'
): Promise<CheckoutResult> {
  const res = await fetch("/api/eturista/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: sessionToken,
      "X-Environment": environment
    },
    body: JSON.stringify({
      externalId,
      accommodationId,
      checkoutDateTime,
      numberOfNights: numberOfNights ?? null,
      isAmendment,
    }),
  });

  const data: any = await res.json();

  if (!res.ok) {
    return {
      success: false,
      message: data.details || data.error || "Check-out failed",
    };
  }

  return { success: true, message: data.message, warnings: data.warnings };
}

// ─── Get Guests (History) ─────────────────────────────────────────────────────

export async function getRegisteredGuests(
  token: string,
  filters: any,
  environment: 'test' | 'prod' = 'test'
): Promise<any> {
  const res = await fetch(`/api/eturista/guests`, {
    method: 'POST',
    headers: { 
      'Authorization': token,
      'Content-Type': 'application/json',
      'X-Environment': environment
    },
    body: JSON.stringify(filters)
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data.error || 'Nije moguće dohvatiti goste iz eTuriste.';
    let details = `HTTP ${data.status || res.status}`;
    if (data.details) details += `: ${data.details}`;
    if (data.debug && data.debug.responsePreview) {
      details += ` | Preview: ${data.debug.responsePreview}`;
    }
    throw new Error(`${msg} (${details})`);
  }

  return data;
}
