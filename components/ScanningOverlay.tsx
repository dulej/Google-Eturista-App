
import React from 'react';

const ScanningOverlay: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 space-y-6">
      <div className="relative">
        {/* Animated Scanner Effect */}
        <div className="w-56 h-72 border-4 border-slate-200 dark:border-slate-700 rounded-2xl relative overflow-hidden bg-white dark:bg-slate-800 shadow-xl">
          {/* Document Silhouette */}
          <div className="absolute inset-0 p-4 space-y-4 opacity-20">
            <div className="w-12 h-12 bg-slate-400 dark:bg-slate-600 rounded-full"></div>
            <div className="space-y-2">
              <div className="w-full h-3 bg-slate-400 dark:bg-slate-600 rounded"></div>
              <div className="w-3/4 h-3 bg-slate-400 dark:bg-slate-600 rounded"></div>
              <div className="w-1/2 h-3 bg-slate-400 dark:bg-slate-600 rounded"></div>
            </div>
          </div>

          {/* MRZ Target Area */}
          <div className="absolute bottom-4 left-4 right-4 h-16 border-2 border-indigo-500 dark:border-indigo-400 border-dashed rounded-lg bg-indigo-50/50 dark:bg-indigo-900/20 flex items-center justify-center">
             <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest text-center px-2">
                Poravnajte MRZ linije ovde
             </span>
          </div>

          {/* Moving Laser Line */}
          <div className="absolute top-0 left-0 w-full h-1.5 bg-indigo-500 dark:bg-indigo-400 shadow-[0_0_15px_rgba(79,70,229,1)] animate-scanner z-10"></div>
        </div>

        {/* Floating Icons */}
        <div className="absolute -top-4 -right-4 w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white shadow-lg animate-pulse">
           <i className="fas fa-barcode"></i>
        </div>
      </div>
      
      <div className="text-center space-y-2">
        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Analiziranje MRZ podataka</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm max-w-xs mx-auto">
          Naš AI dekodira mašinski čitljivu zonu za 100% tačnost registracije.
        </p>
      </div>

      <div className="flex space-x-2">
        <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
        <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
        <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full animate-bounce"></div>
      </div>

      <style>{`
        @keyframes scanner {
          0% { top: 10%; }
          85% { top: 90%; }
          100% { top: 10%; }
        }
        .animate-scanner {
          animation: scanner 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default ScanningOverlay;
