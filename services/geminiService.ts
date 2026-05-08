/**
 * geminiService.ts
 *
 * Handles AI-powered ID/passport scanning via Google Gemini
 */

import { GoogleGenAI } from '@google/genai';
import { GuestData, DocumentType, Gender } from '../types';

// ─── Gemini setup ─────────────────────────────────────────────────────────────

const API_KEY = process.env.GEMINI_API_KEY as string;

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
