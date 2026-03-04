
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
import { Step, GuestData, DocumentCategory, PdfCustomization, PlanType } from './types';
import { extractGuestDataFromId, submitToETurista, loginToETurista, getSmeštajneJedinice } from './services/geminiService';

const App: React.FC = () => {
  const [step, setStep] = useState<Step>('LOGIN');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [accommodations, setAccommodations] = useState<any[]>([]);
  const [activeObject, setActiveObject] = useState<any>(null);
  const [category, setCategory] = useState<DocumentCategory>(DocumentCategory.PASSPORT);
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
        
        // Audit log
        fetch('/api/logs/audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'FRONTEND_LOGIN_SUCCESS',
            userId: auth.id,
            details: `User ${user} logged in from frontend`
          })
        }).catch(console.error);

        const objects = await getSmeštajneJedinice(auth.token, auth.id);
        if (objects && objects.length > 0) {
          setAccommodations(objects);
          setStep('SELECT_OBJECT');
          return true;
        } else {
          setError("No accommodation objects found for this account.");
          return false;
        }
      }
      return false;
    } catch (err: any) {
      setError(err.message || "Login failed");
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

  const handleTypeSelection = (cat: DocumentCategory) => {
    if (!hasUnlimited && credits < 1) {
      setError("Insufficient credits. 1 credit covers scanning and registration.");
      setStep('BILLING');
      return;
    }
    setCategory(cat);
    setStep('SELECT_IMAGE');
  };

  const handleImagesReady = useCallback(async (images: string[]) => {
    setStep('SCANNING');
    setError(null);
    try {
      const extracted = await extractGuestDataFromId(images);
      setGuestData(extracted);
      setStep('REVIEW_DATA');
    } catch (err) {
      console.error("Extraction error:", err);
      setError("Failed to extract data. Please ensure the MRZ area is clear and visible.");
      setStep('SELECT_IMAGE');
    }
  }, []);

  const handleFinalRegistration = async () => {
    if (!hasUnlimited && credits < 1) {
      setError("Insufficient credits for Registration.");
      setStep('BILLING');
      return;
    }

    if (!sessionToken || !activeObject || !guestData) {
      setError("Session or data lost. Please start again.");
      setStep('LOGIN');
      return;
    }

    const objekatId = activeObject.id;
    const objekatNaziv = activeObject.name || "Property";
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
            details: `Guest ${guestData.firstName} ${guestData.lastName} registered successfully`
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
        setError(`eTurista Registration Failed: ${result.message}`);
      }
    } catch (err: any) {
      setError(`Unexpected error: ${err.message}`);
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
              objectName={activeObject.naziv || activeObject.Naziv || "Property"} 
              onStartCheckin={() => setStep('SELECT_TYPE')}
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

          {step === 'SELECT_TYPE' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">New Guest Check-in</h2>
                <p className="text-slate-500 dark:text-slate-400 mt-1">1 credit covers scanning + registration.</p>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <button
                  onClick={() => handleTypeSelection(DocumentCategory.PASSPORT)}
                  className="flex items-center p-6 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-3xl hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/20 transition-all group shadow-sm"
                >
                  <div className="w-14 h-14 bg-indigo-100 dark:bg-indigo-900/40 rounded-2xl flex items-center justify-center mr-4 group-hover:bg-indigo-200 dark:group-hover:bg-indigo-800/60 transition-colors">
                    <i className="fas fa-passport text-2xl text-indigo-600 dark:text-indigo-400"></i>
                  </div>
                  <div className="text-left flex-1">
                    <span className="block font-bold text-slate-800 dark:text-slate-100">Passport</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">Full cycle extraction</span>
                  </div>
                  {!hasUnlimited && <span className="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase mr-4">1 Credit</span>}
                  <i className="fas fa-chevron-right text-slate-300 dark:text-slate-600 group-hover:text-indigo-400"></i>
                </button>

                <button
                  onClick={() => handleTypeSelection(DocumentCategory.ID_CARD)}
                  className="flex items-center p-6 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-3xl hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/20 transition-all group shadow-sm"
                >
                  <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/40 rounded-2xl flex items-center justify-center mr-4 group-hover:bg-emerald-200 dark:group-hover:bg-emerald-800/60 transition-colors">
                    <i className="fas fa-id-card text-2xl text-emerald-600 dark:text-emerald-400"></i>
                  </div>
                  <div className="text-left flex-1">
                    <span className="block font-bold text-slate-800 dark:text-slate-100">Identity Card</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">Front + Back analysis</span>
                  </div>
                  {!hasUnlimited && <span className="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase mr-4">1 Credit</span>}
                  <i className="fas fa-chevron-right text-slate-300 dark:text-slate-600 group-hover:text-emerald-400"></i>
                </button>
              </div>
              <button onClick={() => setStep('DASHBOARD')} className="w-full text-xs font-bold text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors py-2 uppercase tracking-widest"><i className="fas fa-arrow-left mr-1"></i> Back to Menu</button>
            </div>
          )}

          {step === 'SELECT_IMAGE' && <ImageSelector category={category} onImagesReady={handleImagesReady} onBack={() => setStep('SELECT_TYPE')} />}
          {step === 'SCANNING' && <ScanningOverlay />}
          {step === 'REVIEW_DATA' && guestData && (
            <GuestForm 
              initialData={guestData} 
              onSubmit={d => { setGuestData(d); setStep('GENERATE_PDF'); }} 
              onCancel={() => setStep('SELECT_IMAGE')} 
              isSubmitting={false} 
              submitLabel="Confirm & Go to Invoice"
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
                <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Check-in Complete!</h2>
                <p className="text-slate-500 dark:text-slate-400">Guest registered and session finalized.</p>
              </div>
              <div className="pt-4">
                <button onClick={() => { setStep('DASHBOARD'); setGuestData(null); }} className="w-full py-4 bg-slate-800 dark:bg-indigo-600 text-white font-bold rounded-2xl shadow-lg hover:bg-slate-900 dark:hover:bg-indigo-700 transition-all flex items-center justify-center space-x-2">
                  <i className="fas fa-home"></i>
                  <span>Return to Dashboard</span>
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
