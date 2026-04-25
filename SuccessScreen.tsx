import React from 'react';

interface SuccessScreenProps {
  onDone: () => void;
}

const SuccessScreen: React.FC<SuccessScreenProps> = ({ onDone }) => (
  <div className="text-center py-8 space-y-6 animate-in zoom-in duration-300">
    <div className="w-24 h-24 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto text-green-600 dark:text-green-400 shadow-inner">
      <i className="fas fa-check text-4xl" />
    </div>

    <div className="space-y-2">
      <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100">
        Prijava završena!
      </h2>
      <p className="text-slate-500 dark:text-slate-400">
        Gost je registrovan i sesija je završena.
      </p>
    </div>

    <div className="pt-4">
      <button
        onClick={onDone}
        className="w-full py-4 bg-slate-800 dark:bg-indigo-600 text-white font-bold rounded-2xl shadow-lg hover:bg-slate-900 dark:hover:bg-indigo-700 transition-all flex items-center justify-center space-x-2"
      >
        <i className="fas fa-home" />
        <span>Povratak na glavni meni</span>
      </button>
    </div>
  </div>
);

export default SuccessScreen;
