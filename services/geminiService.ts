
import { GoogleGenAI, Type } from "@google/genai";
import { GuestData, DocumentType, Gender } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

/**
 * OCR Extraction using Gemini
 */
export const extractGuestDataFromId = async (images: string[]): Promise<GuestData> => {
  const parts = images.map(base64Image => ({
    inlineData: {
      mimeType: 'image/jpeg',
      data: base64Image.replace(/^data:image\/(png|jpeg|jpg);base64,/, ""),
    },
  }));

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        ...parts,
        {
          text: `You are a specialist in document OCR for the Serbian eTurista system. 
          1. Locate the Machine Readable Zone (MRZ).
          2. Extract names, document number, and dates.
          3. Pay special attention to 'Place of Birth' and 'Country of Birth' (State of birth).
          4. Return a clean JSON object. Standardize dates to YYYY-MM-DD.
          5. Map gender to 'Male' or 'Female'.`,
        },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          firstName: { type: Type.STRING },
          lastName: { type: Type.STRING },
          dateOfBirth: { type: Type.STRING },
          placeOfBirth: { type: Type.STRING, description: 'City or town of birth' },
          countryOfBirth: { type: Type.STRING, description: 'Country or State of birth' },
          nationality: { type: Type.STRING },
          documentType: { type: Type.STRING },
          documentNumber: { type: Type.STRING },
          issuingCountry: { type: Type.STRING },
          expiryDate: { type: Type.STRING },
          gender: { type: Type.STRING },
          rawMrz: { type: Type.STRING }
        },
        required: ['firstName', 'lastName', 'documentNumber'],
      },
    },
  });

  const rawJson = response.text.trim();
  const parsed = JSON.parse(rawJson);

  return {
    firstName: parsed.firstName || '',
    lastName: parsed.lastName || '',
    dateOfBirth: parsed.dateOfBirth || '',
    placeOfBirth: parsed.placeOfBirth || '',
    countryOfBirth: parsed.countryOfBirth || '',
    nationality: parsed.nationality || '',
    documentType: (parsed.documentType as DocumentType) || DocumentType.PASSPORT,
    documentNumber: parsed.documentNumber || '',
    issuingCountry: parsed.issuingCountry || '',
    expiryDate: parsed.expiryDate || '',
    gender: (parsed.gender === 'Female' ? Gender.FEMALE : Gender.MALE),
    arrivalDate: new Date().toISOString().split('T')[0],
    rawMrz: parsed.rawMrz || '',
  };
};

/**
 * eTurista API Integration: Login
 */
export async function loginToETurista(username: string, password: string): Promise<{ token: string; id: number } | null> {
  try {
    const response = await fetch('/api/eturista/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'LOGIN_FAILED');
    }
    
    const data = await response.json();
    return { token: data.sessionToken, id: data.userId };
  } catch (error: any) {
    throw error;
  }
}

/**
 * Fetches the list of cities from our backend.
 */
export async function getGradovi(token: string): Promise<any[]> {
  try {
    const response = await fetch('/api/eturista/cities', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("Error fetching cities:", error);
    return [];
  }
}

/**
 * Fetches the list of accommodation objects from our backend.
 */
export async function getSmeštajneJedinice(token: string, userId: number): Promise<any[]> {
  try {
    const response = await fetch(`/api/eturista/accommodations?userId=${userId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    return [];
  }
}

/**
 * Final registration of the guest in eTurista via our backend.
 */
export const submitToETurista = async (
  guest: GuestData, 
  token: string, 
  accommodationId: number
): Promise<{ success: boolean; message?: string }> => {
  try {
    const response = await fetch('/api/eturista/register', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ guest, accommodationId })
    });

    if (!response.ok) {
      const err = await response.json();
      return { success: false, message: err.error || 'REGISTRATION_FAILED' };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
};
