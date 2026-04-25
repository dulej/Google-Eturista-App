
export enum DocumentType {
  PASSPORT = 'Pasoš',
  ID_CARD = 'Lična karta',
  DRIVERS_LICENSE = 'Vozačka dozvola',
  OTHER = 'Ostalo'
}

export type Step = 'LOGIN' | 'SELECT_OBJECT' | 'DASHBOARD' | 'PDF_SETTINGS' | 'BILLING' | 'SELECT_IMAGE' | 'SCANNING' | 'REVIEW_DATA' | 'SUCCESS' | 'GENERATE_PDF' | 'HISTORY';

export enum Gender {
  MALE = 'Muški',
  FEMALE = 'Ženski'
}

export interface GuestData {
  firstName: string;
  lastName: string;
  dateOfBirth: string; // ISO format
  countryOfBirth: string;
  nationality: string;
  documentType: DocumentType;
  documentNumber?: string;
  issuingCountry: string;
  expiryDate: string; // ISO format
  gender: Gender;
  arrivalDate: string;
  departureDate?: string;
  rawMrz?: string; // Machine Readable Zone raw string
  
  // New fields for Serbian guests
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
  signatureImage?: string; // Base64 image
}

export type PlanType = 'STARTER' | 'PRO' | 'ENTERPRISE';

export interface UserAccount {
  plan: PlanType;
  credits: number;
}

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
