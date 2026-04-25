
import React from 'react';

interface DashboardProps {
  objectName: string;
  unitName?: string;
  onStartCheckin: () => void;
  onPdfSettings: () => void;
  onBilling: () => void;
  onHistory: () => void;
  onBack: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ objectName, unitName, onStartCheckin, onPdfSettings, onBilling, onHistory, onBack }) => {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center">
        <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/40 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 mx-auto mb-4">
          <i className="fas fa-th-large text-2xl"></i>
        </div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Glavni meni</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Objekat: <strong>{objectName}</strong>
          {unitName && <span className="block text-indigo-600 dark:text-indigo-400 text-sm font-semibold">Jedinica: {unitName}</span>}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <button
          onClick={onStartCheckin}
          className="flex items-center p-6 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-3xl hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-all group shadow-sm text-left"
        >
          <div className="w-14 h-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center mr-4 shadow-lg group-hover:scale-105 transition-transform">
            <i className="fas fa-user-plus text-xl"></i>
          </div>
          <div className="flex-1">
            <span className="block font-bold text-slate-800 dark:text-slate-100 text-lg">Nova prijava gosta</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">Skeniranje + Registracija</span>
          </div>
          <div className="text-[10px] font-black text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1 rounded-full uppercase tracking-widest">
            1 Kredit
          </div>
        </button>

        <button
          onClick={onHistory}
          className="flex items-center p-6 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-3xl hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-all group shadow-sm text-left"
        >
          <div className="w-14 h-14 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mr-4 shadow-sm group-hover:scale-105 transition-transform">
            <i className="fas fa-history text-xl"></i>
          </div>
          <div>
            <span className="block font-bold text-slate-800 dark:text-slate-100 text-lg">Istorija prijava</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">Pregled zapisa u poslednjih 30 dana</span>
          </div>
        </button>

        <button
          onClick={onPdfSettings}
          className="flex items-center p-6 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-3xl hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-all group shadow-sm text-left"
        >
          <div className="w-14 h-14 bg-slate-800 dark:bg-slate-700 text-white rounded-2xl flex items-center justify-center mr-4 shadow-lg group-hover:scale-105 transition-transform">
            <i className="fas fa-file-signature text-xl"></i>
          </div>
          <div>
            <span className="block font-bold text-slate-800 dark:text-slate-100 text-lg">Podešavanja računa</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">Poslovni podaci i potpisi</span>
          </div>
        </button>

        <button
          onClick={onBilling}
          className="flex items-center p-6 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-3xl hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-all group shadow-sm text-left"
        >
          <div className="w-14 h-14 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center mr-4 shadow-sm group-hover:scale-105 transition-transform">
            <i className="fas fa-credit-card text-xl"></i>
          </div>
          <div>
            <span className="block font-bold text-slate-800 dark:text-slate-100 text-lg">Planovi i dopuna</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">Upravljaj pretplatom i plaćanjem</span>
          </div>
        </button>
      </div>

      <button
        onClick={onBack}
        className="w-full py-3 text-slate-400 font-bold hover:text-indigo-600 transition-colors text-xs uppercase tracking-widest"
      >
        <i className="fas fa-arrow-left mr-2"></i>
        Promeni objekat
      </button>
    </div>
  );
};

export default Dashboard;
