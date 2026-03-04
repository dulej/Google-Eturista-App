
export enum DocumentType {
  PASSPORT = 'Passport',
  ID_CARD = 'Identity Card',
  DRIVERS_LICENSE = 'Drivers License',
  OTHER = 'Other'
}

export enum DocumentCategory {
  PASSPORT = 'PASSPORT',
  ID_CARD = 'ID_CARD'
}

export enum Gender {
  MALE = 'Male',
  FEMALE = 'Female',
  OTHER = 'Other'
}

export interface GuestData {
  firstName: string;
  lastName: string;
  dateOfBirth: string; // ISO format
  placeOfBirth: string;
  countryOfBirth: string;
  nationality: string;
  documentType: DocumentType;
  documentNumber: string;
  issuingCountry: string;
  expiryDate: string; // ISO format
  gender: Gender;
  arrivalDate: string;
  departureDate?: string;
  rawMrz?: string; // Machine Readable Zone raw string
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

export type Step = 'LOGIN' | 'SELECT_OBJECT' | 'DASHBOARD' | 'PDF_SETTINGS' | 'BILLING' | 'SELECT_TYPE' | 'SELECT_IMAGE' | 'SCANNING' | 'REVIEW_DATA' | 'SUCCESS' | 'GENERATE_PDF' | 'HISTORY';
