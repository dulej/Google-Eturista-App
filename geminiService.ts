/**
 * geminiService.ts
 *
 * Handles:
 *  1. AI-powered ID/passport scanning via Google Gemini
 *  2. eTurista API calls proxied through our Express server
 *
 * All eTurista API calls go through /api/eturista/* — the server handles
 * credentials, CORS, and payload building. Never call the eTurista API directly
 * from the frontend.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { GuestData, DocumentType, Gender } from '../types';

// ─── Gemini setup ─────────────────────────────────────────────────────────────

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;

// ─── eTurista: Login ──────────────────────────────────────────────────────────

export async function loginToETurista(
  username: string,
  password: string,
): Promise<{ token: string; id: number }> {
  const res = await fetch('/api/eturista/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Prijava nije uspela.');

  return { token: data.sessionToken, id: data.userId };
}

// ─── eTurista: Accommodations ─────────────────────────────────────────────────

export async function getAccommodations(
  token: string,
  userId: number,
): Promise<{ id: number; name: string; address?: string; type?: string }[]> {
  const res = await fetch(`/api/eturista/accommodations?userId=${userId}`, {
    headers: { Authorization: token },
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Nije moguće dohvatiti objekte.');

  return data;
}

// ─── eTurista: Register guest ─────────────────────────────────────────────────

export async function submitToETurista(
  guestData: GuestData,
  sessionToken: string,
  accommodationId: number,
): Promise<{ success: boolean; message?: string }> {
  const res = await fetch('/api/eturista/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: sessionToken,
    },
    body: JSON.stringify({
      accommodationId,
      guest: {
        // Identity
        firstName:    guestData.firstName,
        lastName:     guestData.lastName,
        dateOfBirth:  guestData.dateOfBirth,
        gender:       guestData.gender,
        isDomestic:   guestData.isDomestic,
        countryOfBirth: guestData.countryOfBirth,
        placeOfBirth: guestData.placeOfBirth,
        nationality:  guestData.nationality,
        jmbg:         guestData.jmbg,

        // Residence (domestic)
        residenceCountry:            guestData.residenceCountry,
        municipalityOfResidence:     guestData.municipalityOfResidence,
        placeOfResidence:            guestData.placeOfResidence,

        // Document (foreign)
        documentTypeCode:  mapDocumentTypeToCode(guestData.documentType),
        documentNumber:    guestData.documentNumber,
        documentIssueDate: guestData.documentIssueDate,
        entryDateToSerbia: guestData.entryDateToSerbia,
        entryPlaceToSerbia: guestData.entryPlaceToSerbia,         // šifra
        entryPlaceToSerbiaName: guestData.entryPlaceToSerbia,     // TODO: resolve name from code

        // Stay
        arrivalDate:          guestData.arrivalDate,
        arrivalTime:          guestData.arrivalTime,
        plannedDepartureDate: guestData.plannedDepartureDate || guestData.departureDate,
        serviceType:          guestData.serviceType,
        arrivalMode:          guestData.arrivalMode,
        stayReason:           guestData.stayReason,
        agencyName:           undefined, // set if arrivalMode is '2' or '4'
      },
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    const msg = Array.isArray(data.details)
      ? data.details.join('\n')
      : (data.error || 'Registracija nije uspela.');
    return { success: false, message: msg };
  }

  return { success: true, message: data.response };
}

// ─── Document type code mapper ────────────────────────────────────────────────
// Maps our DocumentType enum to eTurista's "Vrsta putne isprave" šifra.
// Full list is in the šifarnik — these are the common ones.

function mapDocumentTypeToCode(docType?: DocumentType): string {
  switch (docType) {
    case DocumentType.PASSPORT:         return '72'; // Pasoš
    case DocumentType.ID_CARD:          return '73'; // Lična karta (strana)
    case DocumentType.DRIVERS_LICENSE:  return '78'; // Vozačka dozvola
    default:                            return '72'; // Default to passport
  }
}

// ─── AI ID/passport scanning ──────────────────────────────────────────────────

export async function extractGuestDataFromId(images: string[]): Promise<GuestData> {
  if (!API_KEY) throw new Error('VITE_GEMINI_API_KEY nije postavljen u .env.local');

  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const imageParts = images.map(base64 => ({
    inlineData: {
      data: base64.includes(',') ? base64.split(',')[1] : base64,
      mimeType: 'image/jpeg' as const,
    },
  }));

  const prompt = `
You are an expert at extracting data from identity documents (passports, ID cards, driver's licenses).
Analyze the provided image(s) and extract all readable information.

Return ONLY a valid JSON object (no markdown, no explanation) with these fields:
{
  "firstName": "string — given name(s), uppercase",
  "lastName": "string — surname, uppercase",
  "dateOfBirth": "YYYY-MM-DD",
  "gender": "Muški or Ženski",
  "documentType": "Pasoš or Lična karta or Vozačka dozvola or Ostalo",
  "documentNumber": "string",
  "documentIssueDate": "YYYY-MM-DD or empty string",
  "expiryDate": "YYYY-MM-DD or empty string",
  "issuingCountry": "3-letter ISO alpha-3 country code",
  "countryOfBirth": "3-letter ISO alpha-3 country code",
  "placeOfBirth": "string or empty string",
  "nationality": "3-letter ISO alpha-3 country code",
  "isDomestic": true if Serbian ID (SRB), false otherwise,
  "jmbg": "13-digit JMBG if visible and it's a Serbian ID, otherwise empty string",
  "rawMrz": "raw MRZ lines joined with newline, or empty string"
}

Rules:
- For Serbian IDs: isDomestic = true, nationality = "SRB"
- For foreign passports: isDomestic = false
- Dates must be YYYY-MM-DD format
- If a field is not visible, use empty string
- Never invent data — only extract what is clearly visible
`;

  const result = await model.generateContent([prompt, ...imageParts]);
  const text   = result.response.text().trim();

  // Strip markdown code fences if present
  const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  let parsed: any;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error('Gemini nije vratio validan JSON. Pokušajte ponovo sa jasnijom slikom.');
  }

  // Map to GuestData
  const docTypeMap: Record<string, DocumentType> = {
    'Pasoš':             DocumentType.PASSPORT,
    'Lična karta':       DocumentType.ID_CARD,
    'Vozačka dozvola':   DocumentType.DRIVERS_LICENSE,
    'Ostalo':            DocumentType.OTHER,
  };
  const genderMap: Record<string, Gender> = {
    'Muški': Gender.MALE, 'M': Gender.MALE,
    'Ženski': Gender.FEMALE, 'F': Gender.FEMALE,
  };

  const today = new Date().toISOString().split('T')[0];

  return {
    firstName:      parsed.firstName     || '',
    lastName:       parsed.lastName      || '',
    dateOfBirth:    parsed.dateOfBirth   || '',
    gender:         genderMap[parsed.gender] || Gender.MALE,
    documentType:   docTypeMap[parsed.documentType] || DocumentType.PASSPORT,
    documentNumber: parsed.documentNumber || '',
    documentIssueDate: parsed.documentIssueDate || '',
    expiryDate:     parsed.expiryDate    || '',
    issuingCountry: parsed.issuingCountry || '',
    countryOfBirth: parsed.countryOfBirth || '',
    placeOfBirth:   parsed.placeOfBirth  || '',
    nationality:    parsed.nationality   || '',
    isDomestic:     parsed.isDomestic === true,
    jmbg:           parsed.jmbg          || '',
    rawMrz:         parsed.rawMrz        || '',
    arrivalDate:    today,
    arrivalTime:    '12:00',
    // These must be filled in by the user on the review screen:
    plannedDepartureDate: '',
    serviceType:    '1',
    arrivalMode:    '1',
    stayReason:     '0',
  };
}

// ─── Legacy alias (keeps any existing imports working) ────────────────────────
export const getSmeštajneJedinice = getAccommodations;
