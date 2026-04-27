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

import { GoogleGenAI } from '@google/genai';
import { GuestData, DocumentType, Gender, Accommodation, AccommodationUnit } from '../types';

// ─── Gemini setup ─────────────────────────────────────────────────────────────

const API_KEY = process.env.GEMINI_API_KEY as string;

// ─── eTurista: Login ──────────────────────────────────────────────────────────

export async function loginToETurista(
  username: string,
  password: string,
  environment: 'test' | 'prod' = 'test'
): Promise<{ token: string; id: number }> {
  const res = await fetch('/api/eturista/login', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'X-Environment': environment 
    },
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
  environment: 'test' | 'prod' = 'test'
): Promise<{ objects: Accommodation[] }> {
  const res = await fetch(`/api/eturista/accommodations?userId=${userId}`, {
    headers: { 
      Authorization: token,
      'X-Environment': environment
    },
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Nije moguće dohvatiti objekte.');

  return data;
}

// ─── eTurista: Units ──────────────────────────────────────────────────────────

export async function getAccommodationUnits(
  token: string,
  accommodationId: number,
  jid?: string,
  environment: 'test' | 'prod' = 'test'
): Promise<AccommodationUnit[]> {
  const url = `/api/eturista/accommodation-units?accommodationId=${accommodationId}${jid ? `&jid=${jid}` : ''}`;
  const res = await fetch(url, {
    headers: { 
      Authorization: token,
      'X-Environment': environment
    },
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data.error || 'Nije moguće dohvatiti jedinice.';
    const details = data.details ? ` (${data.details})` : '';
    throw new Error(`${msg}${details}`);
  }

  return data;
}

// ─── eTurista: Register guest ─────────────────────────────────────────────────

export async function submitToETurista(
  guestData: GuestData,
  sessionToken: string,
  activeObject: { id: number; jid: string },
  environment: 'test' | 'prod' = 'test'
): Promise<{ success: boolean; message?: string; details?: any; response?: any }> {
  const res = await fetch('/api/eturista/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: sessionToken,
      'X-Environment': environment
    },
    body: JSON.stringify({
      accommodationId: activeObject.id,
      jid: activeObject.jid,
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
        agencyName:           guestData.agencyName,
      },
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    return { 
      success: false, 
      message: data.error || 'Registracija nije uspela.',
      details: data.details
    };
  }

  return { 
    success: true, 
    message: data.message || 'Gost je uspešno registrovan.', 
    response: data.response
  };
}

// ─── eTurista: Get Guests (History) ──────────────────────────────────────────

export async function checkoutGuest(
  token: string,
  payload: any,
  environment: 'test' | 'prod' = 'test'
): Promise<any> {
  const res = await fetch('/api/eturista/checkout', {
    method: 'POST',
    headers: {
      'Authorization': token,
      'Content-Type': 'application/json',
      'X-Environment': environment
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data.error || data.message || 'Greška pri odjavi gosta';
    throw new Error(msg);
  }
  return data;
}

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
    const details = data.details ? ` (${data.details})` : '';
    throw new Error(`${msg}${details}`);
  }

  return data;
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
  if (!API_KEY) throw new Error('GEMINI_API_KEY nije postavljen');

  const ai = new GoogleGenAI({ apiKey: API_KEY });

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
  "municipalityOfBirth": "string or empty string",
  "nationality": "3-letter ISO alpha-3 country code",
  "isDomestic": true if Serbian ID (SRB), false otherwise,
  "jmbg": "13-digit JMBG if visible and it's a Serbian ID, otherwise empty string",
  "municipalityOfResidence": "string — for Serbian IDs, the municipality (Opština) of residence",
  "placeOfResidence": "string — for Serbian IDs, the place (Mesto) of residence",
  "issuingAuthority": "string — e.g. MUP - PU KRAGUJEVAC",
  "rawMrz": "raw MRZ lines joined with newline, or empty string"
}

Rules for Serbian (SRB) IDs:
- isDomestic = true, nationality = "SRB".
- "Prebivalište" (Residence): Usually contains both a Place (Mesto) and a Municipality (Opština).
- Fallback Strategy for Residence: If explicit residence is not found, look at "Mesto i opstina rodjenja" (Birth info) or "Organ izdavanja" (Issuing authority). Often they are same as residence.
- Extract Municipality and Place separately. For example, if it says "KRAGUJEVAC, KRAGUJEVAC", then place=KRAGUJEVAC, municipality=KRAGUJEVAC. 

General Rules:
- Dates must be YYYY-MM-DD format.
- If a field is not visible, use empty string.
- Never invent data — only extract what is clearly visible.
`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts: [{ text: prompt }, ...imageParts] },
  });

  const text = response.text?.trim() || '';

  // Strip markdown code fences if present
  const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  let parsed: any;
  try {
    parsed = JSON.parse(clean);
  } catch {
    console.error('Gemini result:', text);
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
    municipalityOfBirth: parsed.municipalityOfBirth || '',
    issuingAuthority: parsed.issuingAuthority || '',
    nationality:    parsed.nationality   || '',
    isDomestic:     parsed.isDomestic === true,
    jmbg:           parsed.jmbg          || '',
    municipalityOfResidence: parsed.municipalityOfResidence || '',
    placeOfResidence:        parsed.placeOfResidence        || '',
    rawMrz:         parsed.rawMrz        || '',
    arrivalDate:    today,
    arrivalTime:    '12:00',
    // These must be filled in by the user on the review screen:
    plannedDepartureDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    serviceType:    '1',
    arrivalMode:    '1',
    stayReason:     '4',
  };
}

// ─── Legacy alias (keeps any existing imports working) ────────────────────────
export const getSmeštajneJedinice = getAccommodations;
