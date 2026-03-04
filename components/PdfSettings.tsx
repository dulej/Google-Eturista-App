
import React, { useState } from 'react';
import { PdfCustomization } from '../types';
import SignaturePad from './SignaturePad';

interface PdfSettingsProps {
  initialSettings: PdfCustomization;
  onSave: (settings: PdfCustomization) => void;
  onBack: () => void;
}

const PdfSettings: React.FC<PdfSettingsProps> = ({ initialSettings, onSave, onBack }) => {
  const [settings, setSettings] = useState<PdfCustomization>(initialSettings);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setSettings(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    onSave(settings);
  };

  const labelClass = "block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 ml-1";
  const inputClass = "w-full p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all dark:text-slate-100";

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center">
        <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-600 dark:text-slate-400 mx-auto mb-4">
          <i className="fas fa-cog text-2xl"></i>
        </div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">PDF Configuration</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Defaults for your registration forms.</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className={labelClass}>Fizicko Lice (Naziv)</label>
          <input 
            name="physicalPersonName" 
            value={settings.physicalPersonName} 
            onChange={handleChange} 
            className={inputClass}
            placeholder="e.g. Dusan Jovanovic"
          />
        </div>
        <div>
          <label className={labelClass}>Adresa Fizickog Lica</label>
          <input 
            name="physicalPersonAddress" 
            value={settings.physicalPersonAddress} 
            onChange={handleChange} 
            className={inputClass}
            placeholder="e.g. Mariborska 4, Nis"
          />
        </div>
        <div>
          <label className={labelClass}>Vrsta i Kategorija Objekta</label>
          <input 
            name="objectType" 
            value={settings.objectType} 
            onChange={handleChange} 
            className={inputClass}
            placeholder="e.g. Soba **"
          />
        </div>
        <div>
          <label className={labelClass}>Adresa Ugostiteljskog Objekta</label>
          <input 
            name="objectAddress" 
            value={settings.objectAddress} 
            onChange={handleChange} 
            className={inputClass}
            placeholder="e.g. Obrenoviceva 12, Nis"
          />
        </div>
        
        <div className="pt-2">
          <label className={labelClass}>Stored Digital Signature</label>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 overflow-hidden">
             {settings.signatureImage ? (
               <div className="relative group">
                 <img src={settings.signatureImage} alt="Signature" className="h-20 mx-auto object-contain dark:invert" />
                 <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button 
                      onClick={() => setSettings(prev => ({ ...prev, signatureImage: undefined }))}
                      className="text-xs font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-1 rounded-full border border-red-100 dark:border-red-900/30"
                    >
                      Delete Signature
                    </button>
                 </div>
               </div>
             ) : (
               <SignaturePad 
                 onSave={(base64) => setSettings(prev => ({ ...prev, signatureImage: base64 }))}
                 onClear={() => setSettings(prev => ({ ...prev, signatureImage: undefined }))}
               />
             )}
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 text-center">Your signature will be placed automatically on every invoice.</p>
        </div>
      </div>

      <div className="pt-4 space-y-3">
        <button
          onClick={handleSave}
          className="w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl shadow-lg hover:bg-indigo-700 transition-all flex items-center justify-center space-x-2"
        >
          <i className="fas fa-save"></i>
          <span>Save Changes</span>
        </button>

        <button
          onClick={onBack}
          className="w-full py-2 text-slate-400 font-bold hover:text-slate-600 transition-colors text-xs"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default PdfSettings;
