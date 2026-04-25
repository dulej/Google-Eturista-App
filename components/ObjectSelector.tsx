
import React from 'react';

interface ObjectSelectorProps {
  objects: any[];
  onSelect: (id: number) => void;
  onBack: () => void;
}

const ObjectSelector: React.FC<ObjectSelectorProps> = ({ objects, onSelect, onBack }) => {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center">
        <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/40 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 mx-auto mb-4">
          <i className="fas fa-hotel text-2xl"></i>
        </div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Izaberite smeštaj</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-1">U koji objekat prijavljujete goste?</p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {objects.map((obj) => {
          const id = obj.id;
          const name = obj.name || `Objekat #${id}`;
          const address = obj.address || '';
          
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className="flex items-center p-5 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/20 transition-all group shadow-sm text-left"
            >
              <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center mr-4 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/50 transition-colors">
                <i className="fas fa-building text-slate-400 dark:text-slate-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400"></i>
              </div>
              <div className="flex-1 overflow-hidden">
                <span className="block font-bold text-slate-800 dark:text-slate-100 truncate">{name}</span>
                {address && <span className="block text-xs text-slate-400 dark:text-slate-500 truncate">{address}</span>}
              </div>
              <i className="fas fa-chevron-right ml-3 text-slate-300 dark:text-slate-600 group-hover:text-indigo-400"></i>
            </button>
          );
        })}
      </div>

      <button
        onClick={onBack}
        className="w-full py-3 text-slate-500 font-bold hover:text-indigo-600 transition-colors text-sm"
      >
        <i className="fas fa-arrow-left mr-2"></i>
        Promeni nalog
      </button>
    </div>
  );
};

export default ObjectSelector;
