// ─── Document & identity enums ───────────────────────────────────────────────

export enum DocumentType {
  PASSPORT        = 'Pasoš',
  ID_CARD         = 'Lična karta',
  DRIVERS_LICENSE = 'Vozačka dozvola',
  OTHER           = 'Ostalo',
}

export enum Gender {
  MALE   = 'Muški',
  FEMALE = 'Ženski',
}

// ─── App navigation ───────────────────────────────────────────────────────────

export type Step =
  | 'LOGIN'
  | 'SELECT_OBJECT'
  | 'SELECT_UNIT'
  | 'DASHBOARD'
  | 'PDF_SETTINGS'
  | 'BILLING'
  | 'SELECT_IMAGE'
  | 'SCANNING'
  | 'REVIEW_DATA'
  | 'GENERATE_PDF'
  | 'SUCCESS'
  | 'HISTORY';

// ─── Domain models ────────────────────────────────────────────────────────────

/** A single accommodation unit returned by the eTurista API. */
export interface Accommodation {
  id: number;
  jid: string;
  name: string;
  address?: string;
  type?: string;
}

export interface AccommodationUnit {
  id: number;
  jid: number;
  number: string;
  floor: string;
  name: string;
}

export interface GuestData {
  firstName: string;
  lastName: string;
  dateOfBirth: string;        // ISO date (YYYY-MM-DD)
  countryOfBirth: string;
  nationality: string;
  documentType: DocumentType;
  documentNumber?: string;
  issuingCountry: string;
  expiryDate: string;         // ISO date
  gender: Gender;
  arrivalDate: string;
  departureDate?: string;
  rawMrz?: string;

  // Extra fields for domestic (Serbian) guests
  isDomestic: boolean;
  jmbg?: string;
  residenceCountry?: string;
  municipalityOfResidence?: string;
  placeOfResidence?: string;
  serviceType?: string;
  arrivalMode?: string;
  stayReason?: string;
  arrivalTime?: string;
  plannedDepartureDate?: string;
  issuingAuthority?: string;
  documentIssueDate?: string;
  entryDateToSerbia?: string;
  entryPlaceToSerbia?: string;
  placeOfBirth?: string;
  municipalityOfBirth?: string;
}

export interface PdfCustomization {
  physicalPersonName: string;
  physicalPersonAddress: string;
  objectType: string;
  objectAddress: string;
  priceDetails: string;
  signatureImage?: string;    // Base64 data URL
}

// ─── Billing ──────────────────────────────────────────────────────────────────

export type PlanType = 'STARTER' | 'PRO' | 'ENTERPRISE';

export interface UserAccount {
  plan: PlanType;
  credits: number;
}

// ─── Log records (read from server) ─────────────────────────────────────────

export interface EntryLog {
  id: number;
  timestamp: string;
  guestName: string;
  documentNumber: string;
  accommodationId: number;
  accommodationName: string;
}

export interface AuditLog {
  id: number;
  timestamp: string;
  action: string;
  userId: string;
  details: string;
}

export interface ErrorLog {
  id: number;
  timestamp: string;
  message: string;
  stack: string;
  context: string;
}
