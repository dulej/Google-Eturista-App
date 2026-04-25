import React, { useState, useCallback, useEffect } from 'react';
import Header from './components/Header';
import LoginScreen from './components/LoginScreen';
import ObjectSelector from './components/ObjectSelector';
import Dashboard from './components/Dashboard';
import PdfSettings from './components/PdfSettings';
import BillingScreen from './components/BillingScreen';
import ImageSelector from './components/ImageSelector';
import ScanningOverlay from './components/ScanningOverlay';
import GuestForm from './components/GuestForm';
import PdfFiller from './components/PdfFiller';
import HistoryView from './components/HistoryView';
import SuccessScreen from './components/SuccessScreen';
import { Step, GuestData, PdfCustomization, PlanType, Accommodation } from './types';
import { extractGuestDataFromId, submitToETurista, loginToETurista, getAccommodations } from './services/geminiService';

// ─── Defaults ────────────────────────────────────────────────────────────────
// No personal data here — users fill these in via the PDF Settings screen.

const DEFAULT_PDF_SETTINGS: PdfCustomization = {
  physicalPersonName:    '',
  physicalPersonAddress: '',
  objectType:            '',
  objectAddress:         '',
  priceDetails:          '',
  signatureImage:        undefined,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

const App: React.FC = () => {
  // Navigation
  const [step, setStep] = useState<Step>('LOGIN');

  // Auth (not persisted — intentionally expires on tab close)
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [userId, setUserId]             = useState<number | null>(null);

  // Accommodations — typed properly
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [activeObject,   setActiveObject]   = useState<Accommodation | null>(null);

  // Guest flow
  const [guestData,    setGuestData]    = useState<GuestData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  // Billing — persisted, but only as a UI preference; actual enforcement is server-side
  const [credits, setCredits] = useState<number>(() => loadFromStorage('eturista_credits', 5));
  const [plan,    setPlan]    = useState<PlanType>(() => loadFromStorage<PlanType>('eturista_plan', 'STARTER'));

  // Theme
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() =>
    localStorage.getItem('eturista_theme') === 'dark'
  );

  // PDF settings
  const [pdfSettings, setPdfSettings] = useState<PdfCustomization>(() =>
    loadFromStorage('eturista_pdf_settings', DEFAULT_PDF_SETTINGS)
  );

  // ── Effects ────────────────────────────────────────────────────────────────

  // Forward unhandled errors to server log
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      fetch('/api/logs/error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(sessionToken ? { Authorization: sessionToken } : {}) },
        body: JSON.stringify({
          message: event.message,
          stack:   event.error?.stack,
          context: 'Frontend Global Error',
        }),
      }).catch(console.error);
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, [sessionToken]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('eturista_theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem('eturista_credits', String(credits));
    localStorage.setItem('eturista_plan', plan);
  }, [credits, plan]);

  useEffect(() => {
    localStorage.setItem('eturista_pdf_settings', JSON.stringify(pdfSettings));
  }, [pdfSettings]);

  // ── Derived state ──────────────────────────────────────────────────────────

  const hasUnlimited = plan === 'PRO' || plan === 'ENTERPRISE';

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleLogin = useCallback(async (user: string, pass: string): Promise<boolean> => {
    setError(null);
    try {
      const auth = await loginToETurista(user, pass);
      if (!auth?.token) return false;

      setSessionToken(auth.token);
      setUserId(auth.id);

      const objects = await getAccommodations(auth.token, auth.id);
      if (objects && objects.length > 0) {
        setAccommodations(objects);
        setStep('SELECT_OBJECT');
        return true;
      }
      setError('Nisu pronađeni smeštajni objekti za ovaj nalog.');
      return false;
    } catch (err: any) {
      setError(err.message ?? 'Prijava nije uspela.');
      throw err;
    }
  }, []);

  const handleObjectSelect = useCallback((id: number) => {
    const obj = accommodations.find(o => o.id === id) ?? null;
    setActiveObject(obj);
    setStep('DASHBOARD');
  }, [accommodations]);

  const handleLogout = useCallback(() => {
    setSessionToken(null);
    setUserId(null);
    setActiveObject(null);
    setAccommodations([]);
    setGuestData(null);
    setStep('LOGIN');
  }, []);

  const handleImagesReady = useCallback(async (images: string[]) => {
    if (!hasUnlimited && credits < 1) {
      setError('Nedovoljno kredita. 1 kredit pokriva skeniranje i registraciju.');
      setStep('BILLING');
      return;
    }
    setStep('SCANNING');
    setError(null);
    try {
      const extracted = await extractGuestDataFromId(images);
      setGuestData(extracted);
      setStep('REVIEW_DATA');
    } catch (err) {
      console.error('Extraction error:', err);
      setError('Neuspešno izvlačenje podataka. Proverite da li je MRZ zona jasna i vidljiva.');
      setStep('SELECT_IMAGE');
    }
  }, [hasUnlimited, credits]);

  const handleFinalRegistration = useCallback(async () => {
    if (!hasUnlimited && credits < 1) {
      setError('Nedovoljno kredita za registraciju.');
      setStep('BILLING');
      return;
    }
    if (!sessionToken || !activeObject || !guestData) {
      setError('Sesija ili podaci su izgubljeni. Molimo počnite ponovo.');
      setStep('LOGIN');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await submitToETurista(guestData, sessionToken, activeObject.id);

      if (result.success) {
        // Save to local entry history (server-side audit log is written inside /api/eturista/register)
        try {
          await fetch('/api/logs/entry', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: sessionToken,
            },
            body: JSON.stringify({
              guestName:        `${guestData.firstName} ${guestData.lastName}`,
              documentNumber:   guestData.documentNumber ?? '',
              accommodationId:  activeObject.id,
              accommodationName: activeObject.name,
            }),
          });
        } catch (dbErr) {
          console.error('Failed to save guest to history:', dbErr);
          // Non-fatal — don't block the success flow
        }

        if (!hasUnlimited) {
          setCredits(prev => prev - 1);
        }
        setStep('SUCCESS');
      } else {
        setError(`eTurista registracija nije uspela: ${result.message}`);
      }
    } catch (err: any) {
      setError(`Neočekivana greška: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [hasUnlimited, credits, sessionToken, activeObject, guestData]);

  const handlePurchase = useCallback((type: 'CREDITS' | 'PLAN', value: any) => {
    if (type === 'CREDITS') setCredits(prev => prev + value);
    else setPlan(value);
    setStep('DASHBOARD');
  }, []);

  const handleToggleTheme = useCallback(() => setIsDarkMode(d => !d), []);
  const handleGoBilling   = useCallback(() => setStep('BILLING'), []);
  const handleGoHistory   = useCallback(() => setStep('HISTORY'), []);

  const handleSuccessDone = useCallback(() => {
    setGuestData(null);
    setStep('DASHBOARD');
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      <Header
        isLoggedIn={!!sessionToken}
        credits={credits}
        plan={plan}
        isDarkMode={isDarkMode}
        onToggleTheme={handleToggleTheme}
        onLogout={handleLogout}
        onBilling={handleGoBilling}
      />

      <main className="max-w-xl mx-auto p-4 py-8">
        <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl overflow-hidden p-6 md:p-10 border border-slate-100 dark:border-slate-800 min-h-[450px] transition-colors duration-300">

          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 text-red-700 dark:text-red-400 flex items-start space-x-3 rounded-r-lg animate-in fade-in">
              <i className="fas fa-exclamation-triangle mt-0.5" />
              <span className="text-sm font-medium">{error}</span>
            </div>
          )}

          {step === 'LOGIN' && (
            <LoginScreen onLogin={handleLogin} />
          )}

          {step === 'SELECT_OBJECT' && (
            <ObjectSelector
              objects={accommodations}
              onSelect={handleObjectSelect}
              onBack={handleLogout}
            />
          )}

          {step === 'DASHBOARD' && activeObject && (
            <Dashboard
              objectName={activeObject.name}
              onStartCheckin={() => setStep('SELECT_IMAGE')}
              onPdfSettings={() => setStep('PDF_SETTINGS')}
              onBilling={handleGoBilling}
              onHistory={handleGoHistory}
              onBack={() => setStep('SELECT_OBJECT')}
            />
          )}

          {step === 'HISTORY' && (
            <HistoryView onBack={() => setStep('DASHBOARD')} />
          )}

          {step === 'BILLING' && (
            <BillingScreen
              currentCredits={credits}
              currentPlan={plan}
              onPurchase={handlePurchase}
              onBack={() => setStep('DASHBOARD')}
            />
          )}

          {step === 'PDF_SETTINGS' && (
            <PdfSettings
              initialSettings={pdfSettings}
              onSave={newSettings => { setPdfSettings(newSettings); setStep('DASHBOARD'); }}
              onBack={() => setStep('DASHBOARD')}
            />
          )}

          {step === 'SELECT_IMAGE' && (
            <ImageSelector onImagesReady={handleImagesReady} onBack={() => setStep('DASHBOARD')} />
          )}

          {step === 'SCANNING' && <ScanningOverlay />}

          {step === 'REVIEW_DATA' && guestData && (
            <GuestForm
              initialData={guestData}
              onSubmit={d => { setGuestData(d); setStep('GENERATE_PDF'); }}
              onCancel={() => setStep('SELECT_IMAGE')}
              isSubmitting={false}
              submitLabel="Potvrdi i idi na račun"
              sessionToken={sessionToken!}
            />
          )}

          {step === 'GENERATE_PDF' && guestData && (
            <PdfFiller
              guestData={guestData}
              initialCustomization={pdfSettings}
              onBack={() => setStep('REVIEW_DATA')}
              onRegister={handleFinalRegistration}
              isSubmittingRegistration={isSubmitting}
            />
          )}

          {step === 'SUCCESS' && (
            <SuccessScreen onDone={handleSuccessDone} />
          )}

        </div>
      </main>
    </div>
  );
};

export default App;
