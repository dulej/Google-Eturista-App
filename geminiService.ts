import { GoogleGenerativeAI } from '@google/generative-ai';
import { GuestData, DocumentType, Gender, CheckoutData } from '../types';

// ─── eTurista API calls (all proxied through our server) ─────────────────────

export async function loginToETurista(username: string, password: string): Promise<{ token: string; id: number }> {
  const res = await fetch('/api/eturista/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json() as any;
  if (!res.ok) throw new Error(data.error || 'Prijava nije uspela.');
  return { token: data.sessionToken, id: data.userId };
}

export async function getSmeštajneJedinice(token: string, userId: number) {
  const res = await fetch(`/api/eturista/accommodations?userId=${userId}`, {
    headers: { Authorization: token },
  });
  const data = await res.json() as any;
  if (!res.ok) throw new Error(data.error || 'Nije moguće dohvatiti objekte.');
  return data;
}

export async function submitToETurista(
  guestData: GuestData,
  sessionToken: string,
  accommodationId: number,
): Promise<{ success: boolean; message?: string; externalId?: string; identifikator?: string; warnings?: string[] }> {
  const res = await fetch('/api/eturista/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: sessionToken },
    body: JSON.stringify({ guest: guestData, accommodationId }),
  });

  const data = await res.json() as any;

  if (!res.ok) {
    return {
      success: false,
      message: data.error || 'Registracija nije uspela.',
    };
  }

  return {
    success:       true,
    message:       data.message,
    externalId:    data.externalId,
    identifikator: data.identifikator,
    warnings:      data.warnings,
  };
}

export async function checkoutGuest(
  checkout: CheckoutData,
  sessionToken: string,
): Promise<{ success: boolean; message?: string; warnings?: string[] }> {
  const res = await fetch('/api/eturista/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: sessionToken },
    body: JSON.stringify({
      externalId:      checkout.externalId,
      accommodationId: checkout.accommodationId,
      checkoutDateTime: checkout.checkoutDateTime,
      serviceCount:    checkout.serviceCount,
    }),
  });

  const data = await res.json() as any;

  if (!res.ok) {
    return { success: false, message: data.error || 'Odjava nije uspela.' };
  }

  return { success: true, message: data.message, warnings: data.warnings };
}

// ─── Gemini AI — ID/passport scanning ────────────────────────────────────────

export async function extractGuestDataFromId(images: string[]): Promise<GuestData> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string;
  if (!apiKey) throw new Error('VITE_GEMINI_API_KEY nije postavljen u .env.local');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const imageParts = images.map(base64 => ({
    inlineData: {
      data:     base64.includes(',') ? base64.split(',')[1] : base64,
      mimeType: 'image/jpeg' as const,
    },
  }));

  const prompt = `
You are an expert at reading identity documents (passports, ID cards, driver's licenses).
Analyze the image(s) and extract all readable fields.

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "firstName": "given name(s) — UPPERCASE",
  "lastName": "surname — UPPERCASE",
  "dateOfBirth": "YYYY-MM-DD",
  "gender": "Muški or Ženski",
  "documentType": "Pasoš or Lična karta or Vozačka dozvola or Ostalo",
  "documentTypeCode": "72 for Pasoš, 73 for Lična karta za stranca, 74 for Vozačka dozvola",
  "documentNumber": "string",
  "documentIssueDate": "YYYY-MM-DD or empty",
  "expiryDate": "YYYY-MM-DD or empty",
  "countryOfBirth": "3-letter ISO alpha-3 code (e.g. SRB, MKD, USA)",
  "placeOfBirth": "city name or empty",
  "nationality": "3-letter ISO alpha-3 code",
  "isDomestic": true if Serbian document (SRB), false otherwise,
  "jmbg": "13 digits if visible on Serbian ID, otherwise empty",
  "rawMrz": "MRZ lines joined with newline or empty"
}

Rules:
- isDomestic = true only for Serbian IDs/passports
- All dates must be YYYY-MM-DD
- Never invent data — only extract what is clearly visible
- If a field is not visible, use empty string
`;

  const result = await model.generateContent([prompt, ...imageParts]);
  const text   = result.response.text().trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

  let parsed: any;
  try { parsed = JSON.parse(text); }
  catch { throw new Error('Gemini nije vratio validan JSON. Pokušajte sa jasnijom slikom.'); }

  const docTypeMap: Record<string, DocumentType> = {
    'Pasoš':           DocumentType.PASSPORT,
    'Lična karta':     DocumentType.ID_CARD,
    'Vozačka dozvola': DocumentType.DRIVERS_LICENSE,
    'Ostalo':          DocumentType.OTHER,
  };
  const genderMap: Record<string, Gender> = {
    'Muški': Gender.MALE, 'M': Gender.MALE,
    'Ženski': Gender.FEMALE, 'F': Gender.FEMALE,
  };

  const today = new Date().toISOString().split('T')[0];

  return {
    firstName:        parsed.firstName        || '',
    lastName:         parsed.lastName         || '',
    dateOfBirth:      parsed.dateOfBirth       || '',
    gender:           genderMap[parsed.gender] || Gender.MALE,
    isDomestic:       parsed.isDomestic === true,
    countryOfBirth:   parsed.countryOfBirth    || '',
    placeOfBirth:     parsed.placeOfBirth      || '',
    nationality:      parsed.nationality       || '',
    documentType:     docTypeMap[parsed.documentType] || DocumentType.PASSPORT,
    documentTypeCode: parsed.documentTypeCode  || '72',
    documentNumber:   parsed.documentNumber    || '',
    documentIssueDate: parsed.documentIssueDate || '',
    expiryDate:       parsed.expiryDate        || '',
    jmbg:             parsed.jmbg              || '',
    rawMrz:           parsed.rawMrz            || '',
    // Defaults for stay fields — user fills these in on the review screen
    arrivalDate:          today,
    arrivalTime:          '12:00',
    plannedDepartureDate: '',
    serviceType:          '1',
    arrivalMode:          '1',
    stayReason:           '0',
  };
}
