
import React, { useState } from 'react';
import { GuestData, PdfCustomization } from '../types';
import { generateRegistrationPdf } from '../services/pdfService';
import SignaturePad from './SignaturePad';

interface PdfFillerProps {
  guestData: GuestData;
  initialCustomization: PdfCustomization;
  onBack: () => void;
  onRegister: () => void;
  isSubmittingRegistration: boolean;
}

const PdfFiller: React.FC<PdfFillerProps> = ({ guestData, initialCustomization, onBack, onRegister, isSubmittingRegistration }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [pdfGenerated, setPdfGenerated] = useState(false);
  const [showCustomization, setShowCustomization] = useState(false);

  const [customization, setCustomization] = useState<PdfCustomization>(initialCustomization);

  const handleCustomizationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCustomization(prev => ({ ...prev, [name]: value }));
  };

  const handleGeneratePdf = async () => {
    setIsProcessing(true);
    setStatus("Generating invoice document...");

    try {
      const pdfBytes = await generateRegistrationPdf(guestData, customization);
      
      // Trigger download
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Racun_${guestData.lastName}_${new Date().getTime()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setPdfGenerated(true);
      setStatus("Invoice generated & downloaded!");
    } catch (error) {
      console.error(error);
      setStatus("Error: Failed to generate PDF.");
    } finally {
      setIsProcessing(false);
    }
  };

  const labelClass = "block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1";
  const inputClass = "w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all dark:text-slate-100";

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center">
        <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/40 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 mx-auto mb-4">
          <i className="fas fa-file-invoice text-2xl"></i>
        </div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Registration Document</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Review your document fields and sign.</p>
      </div>

      <div className="flex items-center justify-between px-2">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">Invoice Customization</h3>
        <button 
          onClick={() => setShowCustomization(!showCustomization)}
          className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest hover:underline"
        >
          {showCustomization ? 'Hide Options' : 'Edit for this Guest'}
        </button>
      </div>

      {showCustomization && (
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-[2rem] p-6 space-y-4 animate-in slide-in-from-top-2 duration-300">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className={labelClass}>Fizicko Lice (Naziv)</label>
              <input name="physicalPersonName" value={customization.physicalPersonName} onChange={handleCustomizationChange} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Adresa Fizickog Lica</label>
              <input name="physicalPersonAddress" value={customization.physicalPersonAddress} onChange={handleCustomizationChange} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Vrsta Objekta</label>
              <input name="objectType" value={customization.objectType} onChange={handleCustomizationChange} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Adresa Objekta</label>
              <input name="objectAddress" value={customization.objectAddress} onChange={handleCustomizationChange} className={inputClass} />
            </div>
          </div>
          
          <div>
            <label className={labelClass}>Signature Pad</label>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-2">
              <SignaturePad 
                onSave={(base64) => setCustomization(prev => ({ ...prev, signatureImage: base64 }))}
                onClear={() => setCustomization(prev => ({ ...prev, signatureImage: undefined }))}
              />
            </div>
          </div>
        </div>
      )}

      {!showCustomization && (
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-[2rem] p-6">
          <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Document Details:</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200/50 dark:border-slate-700/50">
              <span className="text-slate-500 dark:text-slate-400 font-medium italic">Guest Name</span>
              <span className="font-bold text-slate-700 dark:text-slate-200">{guestData.firstName} {guestData.lastName}</span>
            </div>
            <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200/50 dark:border-slate-700/50">
              <span className="text-slate-500 dark:text-slate-400 font-medium italic">Issuer</span>
              <span className="font-bold text-slate-700 dark:text-slate-200">{customization.physicalPersonName}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium italic">Signature status</span>
              {customization.signatureImage ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center">
                  <i className="fas fa-check-circle mr-1"></i> Added
                </span>
              ) : (
                <span className="text-amber-500 dark:text-amber-400 font-bold flex items-center">
                  <i className="fas fa-exclamation-circle mr-1"></i> Empty
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {!pdfGenerated ? (
        <button
          onClick={handleGeneratePdf}
          disabled={isProcessing || isSubmittingRegistration}
          className={`w-full py-8 border-2 border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-[2rem] flex flex-col items-center justify-center space-y-3 transition-all hover:bg-indigo-100/50 dark:hover:bg-indigo-900/20 group ${
            isProcessing ? 'opacity-50' : ''
          }`}
        >
          {isProcessing ? (
            <i className="fas fa-circle-notch fa-spin text-3xl text-indigo-600 dark:text-indigo-400"></i>
          ) : (
            <div className="w-14 h-14 bg-white dark:bg-slate-800 shadow-md rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">
              <i className="fas fa-file-pdf text-xl"></i>
            </div>
          )}
          <div className="text-center">
            <p className="font-bold text-indigo-700 dark:text-indigo-300">Generate PDF Document</p>
            <p className="text-[10px] text-indigo-400 dark:text-indigo-500 mt-1 uppercase tracking-widest font-bold">Step 1: Paperwork</p>
          </div>
        </button>
      ) : (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/30 p-6 rounded-[2rem] flex flex-col items-center space-y-3 text-emerald-800 dark:text-emerald-200 animate-in zoom-in">
          <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center text-emerald-500 dark:text-emerald-400 shadow-sm">
            <i className="fas fa-check text-xl"></i>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold">PDF Created & Downloaded</p>
            <p className="text-[10px] opacity-70">Next: Finalize eTurista registration</p>
          </div>
        </div>
      )}

      {status && (
        <div className={`p-3 rounded-xl text-xs font-bold text-center border ${
          status.includes('Error') ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-900/30' : 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-indigo-100 dark:border-indigo-900/30'
        }`}>
          {status}
        </div>
      )}

      <div className="pt-4 space-y-3">
        <button
          onClick={onRegister}
          disabled={isSubmittingRegistration}
          className={`w-full py-5 bg-slate-900 dark:bg-indigo-600 text-white font-bold rounded-3xl shadow-xl hover:bg-black dark:hover:bg-indigo-700 transition-all flex items-center justify-center space-x-3 text-lg ${isSubmittingRegistration ? 'opacity-70 cursor-not-allowed' : ''}`}
        >
          {isSubmittingRegistration ? (
            <i className="fas fa-spinner fa-spin"></i>
          ) : (
            <i className="fas fa-cloud-upload-alt"></i>
          )}
          <span>{isSubmittingRegistration ? 'Registering...' : 'Register with eTurista'}</span>
        </button>

        <button
          onClick={onBack}
          disabled={isSubmittingRegistration}
          className="w-full py-2 text-slate-400 dark:text-slate-500 font-bold hover:text-slate-600 dark:hover:text-slate-300 transition-colors text-xs uppercase tracking-widest"
        >
          <i className="fas fa-arrow-left mr-2"></i>
          Back to review
        </button>
      </div>
    </div>
  );
};

export default PdfFiller;
