import React from 'react';
import { motion } from 'motion/react';
import { AccommodationUnit } from '../types';

interface UnitSelectorProps {
  units: AccommodationUnit[];
  onSelect: (unit: AccommodationUnit) => void;
  onBack: () => void;
  isLoading?: boolean;
}

const UnitSelector: React.FC<UnitSelectorProps> = ({ units, onSelect, onBack, isLoading }) => {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex items-center space-x-4 mb-2">
        <button
          onClick={onBack}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
        >
          <i className="fas fa-arrow-left text-slate-500" />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Izaberite smeštajnu jedinicu</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Izaberite sobu ili apartman u koji se gost prijavljuje</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 animate-pulse">Učitavanje jedinica...</p>
        </div>
      ) : units.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700">
          <i className="fas fa-hotel text-3xl text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-slate-500 dark:text-slate-400 font-medium">Nisu pronađene smeštajne jedinice.</p>
          <p className="text-xs text-slate-400 mt-2">Pokušajte ponovo ili se obratite podršci.</p>

          <button 
            onClick={onBack}
            className="mt-6 text-indigo-600 hover:text-indigo-700 font-semibold flex items-center justify-center space-x-2 mx-auto"
          >
            <i className="fas fa-arrow-left text-sm" />
            <span>Nazad na izbor objekta</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
          {units.map((unit) => (
            <motion.button
              key={unit.id}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => onSelect(unit)}
              className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl hover:border-indigo-500 dark:hover:border-indigo-500 hover:shadow-md transition-all text-left"
            >
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center text-indigo-600">
                  <i className="fas fa-door-open" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800 dark:text-white">
                    {unit.number ? `Broj ${unit.number}` : (unit.name || 'Smeštajna jedinica')}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {unit.floor ? `${unit.floor}. sprat` : 'Prizemlje'} • JID: {unit.jid}
                  </p>
                </div>
              </div>
              <i className="fas fa-chevron-right text-slate-300 dark:text-slate-600" />
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
};

export default UnitSelector;
