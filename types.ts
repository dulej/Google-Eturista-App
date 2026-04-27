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

export type Step =
  | 'LOGIN'
  | 'SELECT_OBJECT'
  | 'DASHBOARD'
  | 'PDF_SETTINGS'
  | 'SELECT_IMAGE'
  | 'SCANNING'
  | 'REVIEW_DATA'
  | 'GENERATE_PDF'
  | 'SUCCESS'
  | 'HISTORY';

export interface Accommodation {
  id:      number;
  name:    string;
  address?: string;
  type?:   string;
}

export interface GuestData {
  // Identity
  firstName:    string;
  lastName:     string;
  dateOfBirth:  string;   // yyyy-MM-dd
  gender:       Gender;
  isDomestic:   boolean;
  countryOfBirth: string; // Alfa3
  placeOfBirth?: string;
  nationality?:  string;  // Alfa3 (foreign only)

  // Document
  documentType:    DocumentType;
  documentTypeCode?: string;  // šifra (e.g. "72" for passport)
  documentNumber?:   string;
  documentIssueDate?: string;
  expiryDate?:       string;
  issuingCountry?:   string;

  // Domestic specific
  jmbg?:                      string;
  residenceCountry?:           string;
  municipalityOfResidence?:    string;
  municipalityOfResidenceName?: string;
  placeOfResidence?:           string;
  placeOfResidenceName?:       string;

  // Foreign specific
  entryDateToSerbia?:      string;
  entryPlaceToSerbia?:     string;  // šifra
  entryPlaceToSerbiaName?: string;

  // Stay
  arrivalDate:          string;
  arrivalTime?:         string;
  plannedDepartureDate?: string;
  departureDate?:        string;
  serviceType?:          string;
  arrivalMode?:          string;
  stayReason?:           string;
  agencyName?:           string;

  // AI scan raw data
  rawMrz?: string;

  // Set after successful checkin (returned from server)
  externalId?:    string;
  identifikator?: string;
}

export interface CheckoutData {
  externalId:       string;
  accommodationId:  number;
  checkoutDateTime: string;  // "yyyy-MM-dd HH:mm"
  serviceCount?:    number;  // BrojPruzenihUslugaSmestaja (required for legal entities)
}

export interface PdfCustomization {
  physicalPersonName:    string;
  physicalPersonAddress: string;
  objectType:            string;
  objectAddress:         string;
  priceDetails:          string;
  signatureImage?:       string;
}

export interface EntryLog {
  id:             number;
  timestamp:      string;
  guestName:      string;
  documentNumber: string;
  accommodationId: number;
  accommodationName: string;
}
