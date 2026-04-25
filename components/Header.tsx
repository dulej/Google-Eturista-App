
import React from 'react';
import { PlanType } from '../types';

interface HeaderProps {
  isLoggedIn: boolean;
  credits: number;
  plan: PlanType;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onLogout: () => void;
  onBilling: () => void;
}

const Header: React.FC<HeaderProps> = ({ 
  isLoggedIn, 
  credits, 
  plan, 
  isDarkMode,
  onToggleTheme,
  onLogout, 
  onBilling 
}) => {
  const isUnlimited = plan === 'PRO' || plan === 'ENTERPRISE';

  return (
    <header className="bg-slate-900 text-white p-4 shadow-xl sticky top-0 z-50">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="bg-indigo-600 w-8 h-8 rounded-lg flex items-center justify-center">
            <i className="fas fa-passport text-white text-lg"></i>
          </div>
          <h1 className="text-xl font-bold tracking-tight hidden sm:block">eTurista <span className="text-indigo-400">Pro</span></h1>
        </div>
        
        <div className="flex items-center space-x-3">
          <button 
            onClick={onToggleTheme}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all text-amber-400"
            title={isDarkMode ? "Prebaci na svetli režim" : "Prebaci na tamni režim"}
          >
            <i className={`fas ${isDarkMode ? 'fa-sun' : 'fa-moon'}`}></i>
          </button>

          {isLoggedIn && (
            <>
              <button 
                onClick={onBilling}
                className="bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-full flex items-center space-x-2 border border-slate-700 transition-all active:scale-95"
              >
                <i className="fas fa-coins text-amber-400 text-xs"></i>
                <div className="flex flex-col items-start leading-none">
                  <span className="text-[10px] font-bold">
                    {isUnlimited ? 'Neograničeno' : credits}
                  </span>
                  <span className="text-[8px] text-slate-500 uppercase font-black">
                    {isUnlimited ? 'Plan aktivan' : 'Krediti'}
                  </span>
                </div>
                <i className="fas fa-plus-circle text-indigo-400 text-[10px]"></i>
              </button>
              
              <button 
                onClick={onLogout}
                className="text-slate-400 hover:text-white p-2 transition-colors"
                title="Odjavi se"
              >
                <i className="fas fa-power-off"></i>
              </button>
            </>
          )}
          {!isLoggedIn && (
            <div className="text-[10px] bg-indigo-600/20 text-indigo-400 border border-indigo-600/30 px-3 py-1 rounded-full uppercase font-bold tracking-widest">
              Poslovni portal
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
