import React, { useState, useCallback, useEffect } from 'react';
import Header from './components/Header';
import LoginScreen from './components/LoginScreen';
import ObjectSelector from './components/ObjectSelector';
import Dashboard from './components/Dashboard';
import PdfSettings from './components/PdfSettings';
import ImageSelector from './components/ImageSelector';
import ScanningOverlay from './components/ScanningOverlay';
import GuestForm from './components/GuestForm';
import PdfFiller from './components/PdfFiller';
import HistoryView from './components/HistoryView';
import { Step, GuestData, PdfCustomization, Accommodation } from './types';
import { extractGuestDataFromId, submitToETurista, loginToETurista, getSmeštajneJedinice } from './services/geminiService';

const App: React.FC = () => {
  const [step,           setStep]           = useState<Step>('LOGIN');
  const [sessionToken,   setSessionToken]   = useState<string | null>(null);
  const [userId,         setUserId]         = useState<number | null>(null);
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [activeObject,   setActiveObject]   = useState<Accommodation | null>(null);
  const [guestData,      setGuestData]      = useState<GuestData | null>(null);
  const [isSubmitting,   setIsSubmitting]   = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [warnings,       setWarnings]       = useState<string[]>([]);

  const [eturistaEnv,    setEturistaEnv]    = useState<'test' | 'prod'>('test');

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() =>
    localStorage.getItem('eturista_theme') === 'dark'
  );

  const [pdfSettings, setPdfSettings] = useState<PdfCustomization>(() => {
    try {
      const saved = localStorage.getItem('eturista_pdf_settings');
      return saved ? JSON.parse(saved) : {
        physicalPersonName: '', physicalPersonAddress: '',
        objectType: '', objectAddress: '', priceDetails: '/', signatureImage: undefined,
      };
    } catch { return { physicalPersonName: '', physicalPersonAddress: '', objectType: '', objectAddress: '', priceDetails: '/', signatureImage: undefined }; }
  });

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('eturista_theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem('eturista_pdf_settings', JSON.stringify(pdfSettings));
  }, [pdfSettings]);

  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      fetch('/api/logs/error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: e.message, stack: e.error?.stack, context: 'Frontend' }),
      }).catch(() => {});
    };
    window.addEventListener('error', onError);
    return () => window.removeEventListener('error', onError);
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleLogin = useCallback(async (user: string, pass: string, env: 'test' | 'prod'): Promise<boolean> => {
    setError(null);
    try {
      setEturistaEnv(env);
      const auth    = await loginToETurista(user, pass, env);
      const objects = await getSmeštajneJedinice(auth.token, auth.id, env);

      setSessionToken(auth.token);
      setUserId(auth.id);

      if (objects?.length > 0) {
        setAccommodations(objects);
        setStep('SELECT_OBJECT');
        return true;
      }
      setError('Nisu pronađeni smeštajni objekti za ovaj nalog.');
      return false;
    } catch (err: any) {
      setError(err.message || 'Prijava nije uspela.');
      throw err;
    }
  }, []);

  const handleObjectSelect = useCallback((id: number) => {
    const obj = accommodations.find(o => o.id === id) ?? null;
    setActiveObject(obj);
    setStep('DASHBOARD');
  }, [accommodations]);

  const handleLogout = useCallback(() => {
    setSessionToken(null); setUserId(null);
    setActiveObject(null); setAccommodations([]);
    setGuestData(null); setStep('LOGIN');
  }, []);

  const handleImagesReady = useCallback(async (images: string[]) => {
    setStep('SCANNING');
    setError(null);
    try {
      const extracted = await extractGuestDataFromId(images);
      setGuestData(extracted);
      setStep('REVIEW_DATA');
    } catch (err: any) {
      setError('Neuspešno izvlačenje podataka. Proverite da li je MRZ zona jasna i vidljiva.');
      setStep('SELECT_IMAGE');
    }
  }, []);

  const handleFinalRegistration = useCallback(async () => {
    if (!sessionToken || !activeObject || !guestData) {
      setError('Sesija ili podaci su izgubljeni. Molimo počnite ponovo.');
      setStep('LOGIN');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setWarnings([]);

    try {
      const result = await submitToETurista(guestData, sessionToken, activeObject, eturistaEnv);

      if (result.success) {
        // Store externalId and identifikator on guestData so checkout can use them
        setGuestData(prev => prev ? {
          ...prev,
          externalId:    result.externalId,
          identifikator: result.identifikator,
        } : prev);

        if (result.warnings?.length) setWarnings(result.warnings);

        setStep('SUCCESS');
      } else {
        setError(`eTurista registracija nije uspela: ${result.message}`);
      }
    } catch (err: any) {
      setError(`Neočekivana greška: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [sessionToken, activeObject, guestData]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      <Header
        isLoggedIn={!!sessionToken}
        isDarkMode={isDarkMode}
        onToggleTheme={() => setIsDarkMode(d => !d)}
        onLogout={handleLogout}
      />

      <main className="max-w-xl mx-auto p-4 py-8">
        <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl overflow-hidden p-6 md:p-10 border border-slate-100 dark:border-slate-800 min-h-[450px] transition-colors duration-300">

          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 text-red-700 dark:text-red-400 flex items-start space-x-3 rounded-r-lg">
              <i className="fas fa-exclamation-triangle mt-0.5" />
              <span className="text-sm font-medium">{error}</span>
            </div>
          )}

          {warnings.length > 0 && (
            <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 text-yellow-700 dark:text-yellow-400 rounded-r-lg">
              <p className="text-sm font-semibold mb-1">Upozorenja:</p>
              <ul className="text-sm list-disc list-inside">
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {step === 'LOGIN' && <LoginScreen onLogin={handleLogin} />}

          {step === 'SELECT_OBJECT' && (
            <ObjectSelector objects={accommodations} onSelect={handleObjectSelect} onBack={handleLogout} />
          )}

          {step === 'DASHBOARD' && activeObject && (
            <Dashboard
              objectName={activeObject.name}
              onStartCheckin={() => setStep('SELECT_IMAGE')}
              onPdfSettings={() => setStep('PDF_SETTINGS')}
              onHistory={() => setStep('HISTORY')}
              onBack={() => setStep('SELECT_OBJECT')}
            />
          )}

          {step === 'HISTORY' && (
            <HistoryView onBack={() => setStep('DASHBOARD')} />
          )}

          {step === 'PDF_SETTINGS' && (
            <PdfSettings
              initialSettings={pdfSettings}
              onSave={s => { setPdfSettings(s); setStep('DASHBOARD'); }}
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
            <div className="text-center py-8 space-y-6 animate-in zoom-in duration-300">
              <div className="w-24 h-24 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto text-green-600 dark:text-green-400 shadow-inner">
                <i className="fas fa-check text-4xl" />
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Prijava završena!</h2>
                <p className="text-slate-500 dark:text-slate-400">Gost je uspešno registrovan u eTurista.</p>
                {guestData?.identifikator && (
                  <p className="text-sm text-slate-400 dark:text-slate-500 font-mono">
                    ID: {guestData.identifikator}
                  </p>
                )}
              </div>
              <div className="pt-4">
                <button
                  onClick={() => { setStep('DASHBOARD'); setGuestData(null); setWarnings([]); }}
                  className="w-full py-4 bg-slate-800 dark:bg-indigo-600 text-white font-bold rounded-2xl shadow-lg hover:bg-slate-900 dark:hover:bg-indigo-700 transition-all flex items-center justify-center space-x-2"
                >
                  <i className="fas fa-home" />
                  <span>Povratak na glavni meni</span>
                </button>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

export default App;
