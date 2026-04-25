
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
import { Step, GuestData, PdfCustomization, PlanType } from './types';
import { extractGuestDataFromId, submitToETurista, loginToETurista, getSmeštajneJedinice } from './services/geminiService';

const App: React.FC = () => {
  const [step, setStep] = useState<Step>('LOGIN');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [accommodations, setAccommodations] = useState<any[]>([]);
  const [activeObject, setActiveObject] = useState<any>(null);
  const [guestData, setGuestData] = useState<GuestData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persistence for User Account (Credits & Plan)
  const [credits, setCredits] = useState<number>(() => {
    const saved = localStorage.getItem('eturista_credits');
    return saved !== null ? parseInt(saved, 10) : 5;
  });
  const [plan, setPlan] = useState<PlanType>(() => {
    return (localStorage.getItem('eturista_plan') as PlanType) || 'STARTER';
  });
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('eturista_theme') === 'dark';
  });

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      fetch('/api/logs/error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: event.message,
          stack: event.error?.stack,
          context: 'Frontend Global Error'
        })
      }).catch(console.error);
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('eturista_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('eturista_theme', 'light');
    }
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem('eturista_credits', credits.toString());
    localStorage.setItem('eturista_plan', plan);
  }, [credits, plan]);

  // PDF Customization persistence
  const [pdfSettings, setPdfSettings] = useState<PdfCustomization>(() => {
    const saved = localStorage.getItem('eturista_pdf_settings');
    return saved ? JSON.parse(saved) : {
      physicalPersonName: 'Dusan Jovanovic',
      physicalPersonAddress: 'Mariborska 4, Nis',
      objectType: 'Soba **',
      objectAddress: 'Obrenoviceva 12, Nis',
      priceDetails: '/',
      signatureImage: undefined
    };
  });

  useEffect(() => {
    localStorage.setItem('eturista_pdf_settings', JSON.stringify(pdfSettings));
  }, [pdfSettings]);

  const hasUnlimited = plan === 'PRO' || plan === 'ENTERPRISE';

  const handleLogin = async (user: string, pass: string) => {
    try {
      setError(null);
      const auth = await loginToETurista(user, pass);
      if (auth && auth.token) {
        setSessionToken(auth.token);
        setUserId(auth.id);
        
        const objects = await getSmeštajneJedinice(auth.token, auth.id);
        if (objects && objects.length > 0) {
          setAccommodations(objects);
          setStep('SELECT_OBJECT');
          return true;
        } else {
          setError("Nisu pronađeni smeštajni objekti za ovaj nalog.");
          return false;
        }
      }
      return false;
    } catch (err: any) {
      setError(err.message || "Prijava nije uspela");
      throw err;
    }
  };

  const handleObjectSelect = (id: number) => {
    const obj = accommodations.find(o => o.id === id);
    setActiveObject(obj);
    setStep('DASHBOARD');
  };

  const handleLogout = () => {
    setSessionToken(null);
    setUserId(null);
    setActiveObject(null);
    setAccommodations([]);
    setGuestData(null);
    setStep('LOGIN');
  };

  const handleImagesReady = useCallback(async (images: string[]) => {
    if (!hasUnlimited && credits < 1) {
      setError("Nedovoljno kredita. 1 kredit pokriva skeniranje i registraciju.");
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
      console.error("Extraction error:", err);
      setError("Neuspešno izvlačenje podataka. Proverite da li je MRZ zona jasna i vidljiva.");
      setStep('SELECT_IMAGE');
    }
  }, []);

  const handleFinalRegistration = async () => {
    if (!hasUnlimited && credits < 1) {
      setError("Nedovoljno kredita za registraciju.");
      setStep('BILLING');
      return;
    }

    if (!sessionToken || !activeObject || !guestData) {
      setError("Sesija ili podaci su izgubljeni. Molimo počnite ponovo.");
      setStep('LOGIN');
      return;
    }

    const objekatId = activeObject.id;
    const objekatNaziv = activeObject.name || "Objekat";
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await submitToETurista(guestData, sessionToken, objekatId);
      if (result.success) {
        // Audit log
        fetch('/api/logs/audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'FRONTEND_REGISTRATION_SUCCESS',
            userId: userId,
            details: `Gost ${guestData.firstName} ${guestData.lastName} uspešno registrovan`
          })
        }).catch(console.error);

        // Save to our local entry logs
        try {
          await fetch('/api/logs/entry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              guestName: `${guestData.firstName} ${guestData.lastName}`,
              documentNumber: guestData.documentNumber,
              accommodationId: objekatId,
              accommodationName: objekatNaziv
            })
          });
        } catch (dbErr) {
          console.error("Failed to save guest to history:", dbErr);
          // Don't block the success flow if DB save fails
        }

        // ONE CREDIT PER WHOLE PROCESS (Scan + Registration)
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
  };

  const handlePurchase = (type: 'CREDITS' | 'PLAN', value: any) => {
    if (type === 'CREDITS') {
      setCredits(prev => prev + value);
    } else {
      setPlan(value);
    }
    setStep('DASHBOARD');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      <Header 
        isLoggedIn={!!sessionToken} 
        credits={credits} 
        plan={plan}
        isDarkMode={isDarkMode}
        onToggleTheme={() => setIsDarkMode(!isDarkMode)}
        onLogout={handleLogout} 
        onBilling={() => setStep('BILLING')}
      />
      
      <main className="max-w-xl mx-auto p-4 py-8">
        <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl overflow-hidden p-6 md:p-10 border border-slate-100 dark:border-slate-800 min-h-[450px] transition-colors duration-300">
          
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 text-red-700 dark:text-red-400 flex items-start space-x-3 rounded-r-lg animate-in fade-in">
              <i className="fas fa-exclamation-triangle mt-0.5"></i>
              <span className="text-sm font-medium">{error}</span>
            </div>
          )}

          {step === 'LOGIN' && <LoginScreen onLogin={handleLogin} />}
          {step === 'SELECT_OBJECT' && <ObjectSelector objects={accommodations} onSelect={handleObjectSelect} onBack={handleLogout} />}
          {step === 'DASHBOARD' && activeObject && (
            <Dashboard 
              objectName={activeObject.naziv || activeObject.Naziv || "Objekat"} 
              onStartCheckin={() => setStep('SELECT_IMAGE')}
              onPdfSettings={() => setStep('PDF_SETTINGS')}
              onBilling={() => setStep('BILLING')}
              onHistory={() => setStep('HISTORY')}
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
              onSave={(newSettings) => { setPdfSettings(newSettings); setStep('DASHBOARD'); }}
              onBack={() => setStep('DASHBOARD')}
            />
          )}

          {step === 'SELECT_IMAGE' && <ImageSelector onImagesReady={handleImagesReady} onBack={() => setStep('DASHBOARD')} />}
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
          {step === 'GENERATE_PDF' && guestData && <PdfFiller guestData={guestData} initialCustomization={pdfSettings} onBack={() => setStep('REVIEW_DATA')} onRegister={handleFinalRegistration} isSubmittingRegistration={isSubmitting} />}

          {step === 'SUCCESS' && (
            <div className="text-center py-8 space-y-6 animate-in zoom-in duration-300">
              <div className="w-24 h-24 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto text-green-600 dark:text-green-400 shadow-inner">
                <i className="fas fa-check text-4xl"></i>
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Prijava završena!</h2>
                <p className="text-slate-500 dark:text-slate-400">Gost je registrovan i sesija je završena.</p>
              </div>
              <div className="pt-4">
                <button onClick={() => { setStep('DASHBOARD'); setGuestData(null); }} className="w-full py-4 bg-slate-800 dark:bg-indigo-600 text-white font-bold rounded-2xl shadow-lg hover:bg-slate-900 dark:hover:bg-indigo-700 transition-all flex items-center justify-center space-x-2">
                  <i className="fas fa-home"></i>
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
