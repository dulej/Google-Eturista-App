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
import UnitSelector from './components/UnitSelector';
import { Step, GuestData, PdfCustomization, PlanType, Accommodation, AccommodationUnit } from './types';
import { extractGuestDataFromId, submitToETurista, loginToETurista, getAccommodations, getAccommodationUnits } from './services/geminiService';

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
  const [environment, setEnvironment]   = useState<'test' | 'prod'>(() => 
    (localStorage.getItem('eturista_env') as 'test' | 'prod') || 'test'
  );

  // Accommodations — typed properly
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [activeObject,   setActiveObject]   = useState<Accommodation | null>(null);
  const [units,          setUnits]          = useState<AccommodationUnit[]>([]);
  const [activeUnit,     setActiveUnit]     = useState<AccommodationUnit | null>(null);
  const [isLoadingUnits, setIsLoadingUnits] = useState(false);

  // Guest flow
  const [guestData,    setGuestData]    = useState<GuestData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<any | null>(null);
  const [lastTransaction, setLastTransaction] = useState<{ request: any, response: any } | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [showErrorJson, setShowErrorJson] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

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

  const addLog = useCallback((msg: string) => {
    setDebugLogs(prev => [msg, ...prev].slice(0, 50));
  }, []);

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

  const handleLogin = useCallback(async (user: string, pass: string, env: 'test' | 'prod'): Promise<boolean> => {
    setError(null);
    try {
      const auth = await loginToETurista(user, pass, env);
      addLog(`Prijava uspešna: Korisnik ${auth.id} (Env: ${env})`);
      if (!auth?.token) return false;

      setSessionToken(auth.token);
      setUserId(auth.id);
      setEnvironment(env);
      localStorage.setItem('eturista_env', env);

      const result = await getAccommodations(auth.token, auth.id, env);
      addLog(`Dohvaćeno ${result.objects?.length} objekata`);
      if (result.objects && result.objects.length > 0) {
        setAccommodations(result.objects);
        
        if (result.objects.length === 1) {
          // Auto-select the only object
          const obj = result.objects[0];
          setActiveObject(obj);
          setStep('SELECT_UNIT');
          setIsLoadingUnits(true);
          try {
            const u = await getAccommodationUnits(auth.token, obj.id, obj.jid, env);
            setUnits(u);
            
            // If unit listing provides a parent JID we didn't have, update the active object
            if (u.length > 0 && u[0].accommodationJid && (!obj.jid || obj.jid === '0')) {
              console.log(`[eTurista] → Updating Object JID from unit data: ${u[0].accommodationJid}`);
              const updatedObj = { ...obj, jid: u[0].accommodationJid };
              setActiveObject(updatedObj);
            }

            if (u.length <= 1) {
              const unit: AccommodationUnit = u.length === 1 ? u[0] : { id: 0, jid: 0, number: '1', floor: '0', name: 'Glavni objekat', accommodationJid: undefined };
              setActiveUnit(unit);
              setStep('DASHBOARD');
            }
          } catch (err: any) {
            // Force progress even on unit fetch error if single property
            setActiveUnit({ id: 0, jid: 0, number: '1', floor: '0', name: 'Glavni objekat', accommodationJid: undefined });
            setStep('DASHBOARD');
          } finally {
            setIsLoadingUnits(false);
          }
        } else {
          setStep('SELECT_OBJECT');
        }
        return true;
      }
      setError('Nisu pronađeni smeštajni objekti za ovaj nalog.');
      return false;
    } catch (err: any) {
      setError(err.message ?? 'Prijava nije uspela.');
      throw err;
    }
  }, []);

  const handleObjectSelect = useCallback(async (id: number) => {
    const obj = accommodations.find(o => o.id === id) ?? null;
    setActiveObject(obj);
    if (obj) {
      setStep('SELECT_UNIT');
      setIsLoadingUnits(true);
      try {
        const u = await getAccommodationUnits(sessionToken!, obj.id, obj.jid, environment);
        setUnits(u);

        // Update JID if unit listing has it
        if (u.length > 0 && u[0].accommodationJid && (!obj.jid || obj.jid === '0')) {
          console.log(`[eTurista] → Updating Object JID from unit data: ${u[0].accommodationJid}`);
          setActiveObject({ ...obj, jid: String(u[0].accommodationJid) });
        }

        if (u.length <= 1) {
          const unit: AccommodationUnit = u.length === 1 ? u[0] : { id: 0, jid: 0, number: '1', floor: '0', name: 'Glavni objekat', accommodationJid: undefined };
          setActiveUnit(unit);
          setStep('DASHBOARD');
        }
      } catch (err: any) {
        // Fallback to avoid getting stuck
        setActiveUnit({ id: 0, jid: 0, number: '1', floor: '0', name: 'Glavni objekat', accommodationJid: undefined });
        setStep('DASHBOARD');
      } finally {
        setIsLoadingUnits(false);
      }
    }
  }, [accommodations, sessionToken]);

  const handleUnitSelect = useCallback((unit: AccommodationUnit) => {
    setActiveUnit(unit);
    setStep('DASHBOARD');
  }, []);

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
      console.log('AI Extracted Data:', extracted);
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
      const result = await submitToETurista(
        guestData, 
        sessionToken, 
        activeObject,
        environment
      );

      if (result.success) {
        setLastTransaction({ request: undefined, response: result.response });
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
        setError(result.message ?? 'eTurista registracija nije uspela.');
        setErrorDetails(result.details);
        setLastTransaction({ request: result.details?.payload, response: result.details?.last_error });
        setShowErrorJson(false); // Reset toggle
      }
    } catch (err: any) {
      setError(`Neočekivana greška: ${err.message}`);
      setErrorDetails(null);
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
            <div className="mb-6 flex flex-col space-y-2 animate-in fade-in">
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 text-red-700 dark:text-red-400 flex items-start space-x-3 rounded-r-lg">
                <i className="fas fa-exclamation-triangle mt-0.5" />
                <div className="flex-1">
                  <span className="text-sm font-medium block">{error}</span>
                  {errorDetails && (
                    <button 
                      onClick={() => setShowErrorJson(!showErrorJson)}
                      className="mt-2 text-xs font-bold underline uppercase tracking-tight hover:text-red-800 dark:hover:text-red-300 transition-colors"
                    >
                      {showErrorJson ? 'Sakrij detalje' : 'Prikaži JSON tela (Body)'}
                    </button>
                  )}
                </div>
              </div>
              
              {showErrorJson && errorDetails && (
                <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-x-auto border border-slate-200 dark:border-slate-700 animate-in slide-in-from-top-2">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Full Request Body (v4.9)</h4>
                  <pre className="text-[10px] font-mono text-slate-700 dark:text-slate-300 overflow-auto max-h-60 leading-relaxed">
                    {JSON.stringify(errorDetails.request_payload || errorDetails, null, 2)}
                  </pre>
                  {errorDetails.eturista_errors && (
                    <>
                      <h4 className="text-[10px] font-bold text-red-500 uppercase tracking-widest mt-4 mb-2">eTurista API Errors</h4>
                      <pre className="text-[10px] font-mono text-red-600 dark:text-red-400 overflow-auto max-h-40 leading-relaxed">
                        {JSON.stringify(errorDetails.eturista_errors, null, 2)}
                      </pre>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 'LOGIN' && (
            <LoginScreen onLogin={handleLogin} />
          )}

          {step === 'SELECT_OBJECT' && (
            <div className="space-y-6">
              <ObjectSelector
                objects={accommodations}
                onSelect={handleObjectSelect}
                onBack={handleLogout}
              />
              
              {!showDebug && (
                <button 
                  onClick={() => setShowDebug(true)}
                  className="w-full py-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:border-indigo-300 hover:text-indigo-500 transition-all group"
                >
                  <i className="fas fa-bug mr-2 opacity-50 group-hover:opacity-100" />
                  Prikaži sirove podatke i JID-ove (Debug)
                </button>
              )}
            </div>
          )}

          {step === 'SELECT_UNIT' && (
            <UnitSelector
              units={units}
              onSelect={handleUnitSelect}
              onBack={() => setStep('SELECT_OBJECT')}
              isLoading={isLoadingUnits}
            />
          )}

          {step === 'DASHBOARD' && activeObject && (
            <Dashboard
              objectName={activeObject.name}
              unitName={activeUnit?.number ? `Soba ${activeUnit.number}` : activeUnit?.name}
              onStartCheckin={() => setStep('SELECT_IMAGE')}
              onPdfSettings={() => setStep('PDF_SETTINGS')}
              onBilling={handleGoBilling}
              onHistory={handleGoHistory}
              onBack={() => setStep('SELECT_OBJECT')}
            />
          )}

          {step === 'HISTORY' && sessionToken && activeObject && (
            <HistoryView 
              onBack={() => setStep('DASHBOARD')} 
              sessionToken={sessionToken} 
              id={activeObject.id} 
              jid={activeObject.jid}
              environment={environment}
            />
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

          {/* Persistent Debug Panel */}
          {(lastTransaction || errorDetails || step === 'SELECT_OBJECT' || step === 'SELECT_UNIT') && (
            <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
              <button 
                onClick={() => setShowDebug(!showDebug)}
                className="w-full flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] hover:text-indigo-500 transition-colors py-2"
              >
                <span>{step === 'SELECT_OBJECT' ? 'Debug - Podaci o Objektima' : 'Debug - Poslednja API Transakcija'}</span>
                <i className={`fas fa-chevron-${showDebug ? 'up' : 'down'}`} />
              </button>
              
              {showDebug && (
                <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-bottom-2">
                  { (lastTransaction || errorDetails) && (
                    <div className="space-y-2">
                      <h4 className="text-[9px] font-black text-emerald-500 uppercase tracking-widest pl-1">Server Response</h4>
                      <div className="bg-slate-50 dark:bg-black/50 rounded-2xl p-4 border border-slate-100 dark:border-white/5 overflow-auto max-h-[300px]">
                        <pre className="text-[10px] font-mono whitespace-pre-wrap break-all leading-relaxed opacity-80">
                          {JSON.stringify(lastTransaction?.response || errorDetails?.last_error || errorDetails?.eturista_errors || errorDetails, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Dohvaćeni Smeštajni Objekti (Raw)</h4>
                    <div className="bg-slate-50 dark:bg-black/50 rounded-2xl p-4 border border-slate-100 dark:border-white/5 overflow-auto max-h-[250px]">
                      <pre className="text-[10px] font-mono whitespace-pre-wrap break-all leading-relaxed opacity-80">
                        {JSON.stringify(accommodations, null, 2)}
                      </pre>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Logovi Sistemskih Poruka</h4>
                    <div className="bg-slate-50 dark:bg-black/50 rounded-2xl p-4 border border-slate-100 dark:border-white/5 overflow-auto max-h-[200px]">
                      <div className="text-[10px] font-mono space-y-1 opacity-80">
                        {debugLogs.length === 0 ? <div className="text-slate-500 italic">Nema logova...</div> : debugLogs.map((log, i) => (
                          <div key={i} className="border-b border-white/5 py-1">{log}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
