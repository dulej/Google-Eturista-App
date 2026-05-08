export enum DocumentType {
  PASSPORT        = 'Pasoš',
  ID_CARD         = 'Lična karta',
  DRIVERS_LICENSE = 'Vozačka dozvola',
  OTHER           = 'Ostalo',
}

// Added CHECKOUT_SUCCESS step
export type Step =
  | 'LOGIN'
  | 'SELECT_OBJECT'
  | 'DASHBOARD'
  | 'PDF_SETTINGS'
  | 'BILLING'
  | 'SELECT_IMAGE'
  | 'SCANNING'
  | 'REVIEW_DATA'
  | 'GENERATE_PDF'
  | 'SUCCESS'
  | 'CHECKOUT_SUCCESS'
  | 'HISTORY';

export enum Gender {
  MALE   = 'Muški',
  FEMALE = 'Ženski',
}

export interface GuestData {
  firstName: string;
  lastName: string;
  dateOfBirth: string;       // YYYY-MM-DD
  countryOfBirth: string;    // ISO Alfa3, e.g. "SRB"
  nationality: string;       // ISO Alfa3
  documentType: DocumentType;
  documentNumber?: string;
  issuingCountry: string;
  expiryDate: string;        // YYYY-MM-DD
  gender: Gender;
  arrivalDate: string;       // YYYY-MM-DD
  departureDate?: string;    // YYYY-MM-DD
  rawMrz?: string;

  // ── Domestic fields ──
  isDomestic: boolean;
  jmbg?: string;
  residenceCountry?: string;          // ISO Alfa3 (default "SRB")
  municipalityOfResidence?: string;   // Matični broj opštine
  municipalityOfResidenceName?: string;
  placeOfResidence?: string;          // Matični broj mesta
  placeOfResidenceName?: string;

  // ── Stay details ──
  serviceType?: string;               // VrstaPruzenihUslugaSifra
  arrivalMode?: string;               // NacinDolaskaSifra
  stayReason?: string;                // RazlogBoravkaSifra
  arrivalTime?: string;               // HH:mm
  plannedDepartureDate?: string;      // YYYY-MM-DD
  taxReductionCondition?: string;     // UslovZaUmanjenjeBoravisneTakseSifra
  agencyName?: string;                // NazivAgencije (when arrival via agency)

  // ── Foreign document fields ──
  documentTypeSifra?: string;         // VrstaPutneIspraveSifra code, e.g. "73"
  documentIssueDate?: string;         // YYYY-MM-DD
  entryDateToSerbia?: string;         // YYYY-MM-DD
  entryPlaceToSerbia?: string;        // MestoUlaskaURepublikuSrbijuSifra
  entryPlaceToSerbiaName?: string;
  stayApprovedUntil?: string;         // DatumDoKadaJeOdobrenBoravakURepubliciSrbiji
  issuingAuthority?: string;          // OrganIzdavanjaPutneIsprave
  visaType?: string;                  // VrstaVizeSifra
  visaNumber?: string;
  visaIssuingPlace?: string;
  note?: string;                      // Napomena

  // ── Foreign personal fields ──
  placeOfBirth?: string;              // MestoRodjenjaNaziv
}

export interface PdfCustomization {
  physicalPersonName: string;
  physicalPersonAddress: string;
  objectType: string;
  objectAddress: string;
  priceDetails: string;
  signatureImage?: string;   // Base64
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
