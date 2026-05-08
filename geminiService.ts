import { GoogleGenAI } from "@google/genai";
import { GuestData, DocumentType, Gender } from "../types";

// ─── Gemini AI setup ──────────────────────────────────────────────────────────

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// ─── ID / MRZ extraction via Gemini Vision ────────────────────────────────────

export async function extractGuestDataFromId(images: string[]): Promise<GuestData> {
  const imageParts = images.map(img => {
    const [header, data] = img.split(",");
    const mimeType = header.match(/data:([^;]+)/)?.[1] ?? "image/jpeg";
    return { inlineData: { mimeType, data } };
  });

  const prompt = `You are an expert at reading identity documents and passports.
Analyze the provided image(s) and extract all visible information.
Return ONLY a valid JSON object with these exact fields (use null for missing fields):
{
  "firstName": string,
  "lastName": string,
  "dateOfBirth": "YYYY-MM-DD",
  "countryOfBirth": "3-letter ISO country code, e.g. SRB",
  "nationality": "3-letter ISO country code",
  "documentType": "Pasoš" | "Lična karta" | "Vozačka dozvola" | "Ostalo",
  "documentNumber": string,
  "issuingCountry": "3-letter ISO country code",
  "expiryDate": "YYYY-MM-DD",
  "gender": "Muški" | "Ženski",
  "isDomestic": true if Serbian citizen otherwise false,
  "jmbg": string or null,
  "placeOfBirth": string or null,
  "rawMrz": string or null
}
Do NOT include any other text, markdown, or explanation — just the JSON object.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [{ role: "user", parts: [...imageParts, { text: prompt }] }],
  });

  const text = response.text?.trim() ?? "";
  const clean = text.replace(/```json|```/g, "").trim();

  try {
    const parsed = JSON.parse(clean);
    return {
      firstName: parsed.firstName ?? "",
      lastName: parsed.lastName ?? "",
      dateOfBirth: parsed.dateOfBirth ?? "",
      countryOfBirth: parsed.countryOfBirth ?? "SRB",
      nationality: parsed.nationality ?? "",
      documentType: (parsed.documentType as DocumentType) ?? DocumentType.PASSPORT,
      documentNumber: parsed.documentNumber ?? "",
      issuingCountry: parsed.issuingCountry ?? "",
      expiryDate: parsed.expiryDate ?? "",
      gender: (parsed.gender as Gender) ?? Gender.MALE,
      arrivalDate: new Date().toISOString().split("T")[0],
      isDomestic: parsed.isDomestic ?? false,
      jmbg: parsed.jmbg ?? undefined,
      placeOfBirth: parsed.placeOfBirth ?? undefined,
      rawMrz: parsed.rawMrz ?? undefined,
    };
  } catch {
    throw new Error("Nije moguće izvući podatke iz slike. Proverite da je dokument jasno vidljiv.");
  }
}

// ─── eTurista: Login ──────────────────────────────────────────────────────────
// One POST to /api/eturista/login → returns { token, refreshToken, id }

export async function loginToETurista(
  username: string,
  password: string
): Promise<{ token: string; refreshToken: string | null; id: number }> {
  const res = await fetch("/api/eturista/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const err: any = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Prijava nije uspela (${res.status})`);
  }

  const data: any = await res.json();
  return {
    token: data.sessionToken,
    refreshToken: data.refreshToken ?? null,
    id: data.userId,
  };
}

// ─── eTurista: Accommodations ─────────────────────────────────────────────────
// One GET to /api/eturista/accommodations → returns array of objects

export async function getSmeštajneJedinice(
  token: string,
  userId: number
): Promise<{ id: number; name: string; address: string; type: string }[]> {
  const res = await fetch(`/api/eturista/accommodations?userId=${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err: any = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Greška pri učitavanju objekata (${res.status})`);
  }

  return res.json();
}

// ─── eTurista: Check-in ───────────────────────────────────────────────────────
// One POST to /api/eturista/checkin
// Returns { success, externalId, eturistaIdentifikator, message, warnings }

export async function submitToETurista(
  guest: GuestData,
  sessionToken: string,
  accommodationId: number
): Promise<{
  success: boolean;
  externalId: string;
  eturistaIdentifikator: string;
  message?: string;
  warnings?: string;
}> {
  const res = await fetch("/api/eturista/checkin", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({ guest, accommodationId }),
  });

  const data: any = await res.json().catch(() => ({}));

  if (!res.ok) {
    return {
      success: false,
      externalId: "",
      eturistaIdentifikator: "",
      message: data.details ?? data.error ?? `Greška prijave (${res.status})`,
    };
  }

  return {
    success: true,
    externalId: data.externalId ?? "",
    eturistaIdentifikator: data.eturistaIdentifikator ?? "",
    message: data.message,
    warnings: data.warnings,
  };
}

// ─── eTurista: Check-out ──────────────────────────────────────────────────────
// One POST to /api/eturista/checkout
// checkoutDateTime format: "YYYY-MM-DD HH:mm"
// numberOfNights: integer ≥ 1, required for legal entities; omit/null for physical persons

export async function checkoutFromETurista(
  sessionToken: string,
  externalId: string,
  accommodationId: number,
  checkoutDateTime: string,
  numberOfNights?: number | null,
  isAmendment = false
): Promise<{ success: boolean; message?: string; warnings?: string }> {
  const res = await fetch("/api/eturista/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({
      externalId,
      accommodationId,
      checkoutDateTime,
      numberOfNights: numberOfNights ?? null,
      isAmendment,
    }),
  });

  const data: any = await res.json().catch(() => ({}));

  if (!res.ok) {
    return {
      success: false,
      message: data.details ?? data.error ?? `Greška odjave (${res.status})`,
    };
  }

  return { success: true, message: data.message, warnings: data.warnings };
}
