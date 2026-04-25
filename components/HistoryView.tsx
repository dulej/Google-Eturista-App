
import React, { useEffect, useState } from 'react';
import { EntryLog } from '../types';
import { Calendar, User, FileText, MapPin, Clock, Trash2, ChevronRight, Search, Database, Table as TableIcon } from 'lucide-react';

interface HistoryViewProps {
  onBack: () => void;
  sessionToken: string;
}

const HistoryView: React.FC<HistoryViewProps> = ({ onBack, sessionToken }) => {
  const [viewMode, setViewMode] = useState<'entries' | 'db'>('entries');
  const [entries, setEntries] = useState<EntryLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // DB Explorer state
  const [tables, setTables] = useState<{name: string, count: number}[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<any[]>([]);
  const [isDbLoading, setIsDbLoading] = useState(false);

  useEffect(() => {
    if (viewMode === 'entries') {
      setIsLoading(true);
      fetch('/api/logs/entries', { headers: { 'Authorization': sessionToken } })
        .then(res => res.json())
        .then(data => {
          setEntries(data);
          setIsLoading(false);
        })
        .catch(err => {
          console.error("Failed to fetch history:", err);
          setIsLoading(false);
        });
    } else {
      setIsDbLoading(true);
      fetch('/api/db/tables', { headers: { 'Authorization': sessionToken } })
        .then(res => res.json())
        .then(data => {
          setTables(data);
          if (data.length > 0 && !selectedTable) {
            setSelectedTable(data[0].name);
          }
          setIsDbLoading(false);
        })
        .catch(err => {
          console.error("Failed to fetch tables:", err);
          setIsDbLoading(false);
        });
    }
  }, [viewMode, sessionToken]);

  useEffect(() => {
    if (viewMode === 'db' && selectedTable) {
      setIsDbLoading(true);
      fetch(`/api/db/data/${encodeURIComponent(selectedTable)}`, { headers: { 'Authorization': sessionToken } })
        .then(res => res.json())
        .then(data => {
          setTableData(data);
          setIsDbLoading(false);
        })
        .catch(err => {
          console.error("Failed to fetch table data:", err);
          setIsDbLoading(false);
        });
    }
  }, [selectedTable, viewMode]);

  const filteredEntries = entries.filter(e => 
    e.guestName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.documentNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('sr-RS', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100">
            {viewMode === 'entries' ? 'Istorija prijava' : 'Pregled baze'}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
            {viewMode === 'entries' 
              ? 'Zapisi o registracijama gostiju.' 
              : 'Pregled referentnih podataka eturista.db.'}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl flex">
            <button 
              onClick={() => setViewMode('entries')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'entries' ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}`}
            >
              Prijave
            </button>
            <button 
              onClick={() => setViewMode('db')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'db' ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}`}
            >
              DB Tabele
            </button>
          </div>
          <button 
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:bg-indigo-100 hover:text-indigo-600 transition-colors"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
      </div>

      {viewMode === 'entries' ? (
        <>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input 
              type="text"
              placeholder="Pretraži po imenu ili dokumentu..."
              className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none dark:text-slate-100"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
            {isLoading ? (
              <div className="py-20 text-center space-y-4">
                <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">Učitavanje zapisa...</p>
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="py-20 text-center space-y-4 bg-slate-50 dark:bg-slate-800/30 rounded-[2rem] border-2 border-dashed border-slate-200 dark:border-slate-700">
                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto text-slate-300">
                  <Clock size={32} />
                </div>
                <p className="text-slate-500 dark:text-slate-400 font-medium">Nema pronađenih zapisa.</p>
              </div>
            ) : (
              filteredEntries.map((entry) => (
                <div 
                  key={entry.id}
                  className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 rounded-2xl shadow-sm hover:shadow-md transition-all group"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                        <User size={20} />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 dark:text-slate-100">{entry.guestName}</h4>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-black tracking-wider">{entry.documentNumber}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-tighter block">Zapisano</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">{formatDate(entry.timestamp)}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-50 dark:border-slate-700/50">
                    <div className="flex items-center space-x-2 text-[10px] text-slate-500 dark:text-slate-400">
                      <MapPin size={12} className="text-slate-300" />
                      <span className="truncate">{entry.accommodationName}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex overflow-x-auto pb-2 space-x-2 custom-scrollbar no-scrollbar">
            {tables.map(table => (
              <button
                key={table.name}
                onClick={() => setSelectedTable(table.name)}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                  selectedTable === table.name 
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none' 
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-indigo-300'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <TableIcon size={14} />
                  <span>{table.name}</span>
                  <span className={`ml-1 px-1.5 py-0.5 rounded-md text-[10px] ${selectedTable === table.name ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
                    {table.count}
                  </span>
                </div>
              </button>
            ))}
          </div>

          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            {isDbLoading ? (
              <div className="py-20 text-center space-y-4">
                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Upit baze...</p>
              </div>
            ) : tableData.length === 0 ? (
              <div className="py-20 text-center text-slate-400 text-sm italic">
                Nema podataka u ovoj tabeli.
              </div>
            ) : (
              <>
                <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                  <span className="text-[10px] font-black text-slate-500 uppercase">Tabela: {selectedTable}</span>
                  <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase">Ukupno redova: {tableData.length}</span>
                </div>
                <div className="overflow-x-auto max-h-[400px] custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 z-10">
                    <tr>
                      {Object.keys(tableData[0]).map(key => (
                        <th key={key} className="px-4 py-3 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {tableData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-white dark:hover:bg-slate-800/50 transition-colors">
                        {Object.values(row).map((val: any, i) => (
                          <td key={i} className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {val === null ? <span className="text-slate-300 italic">null</span> : String(val)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
      )}

      <button 
        onClick={onBack}
        className="w-full py-4 bg-slate-900 dark:bg-slate-800 text-white font-bold rounded-2xl hover:bg-black transition-all"
      >
        Nazad na meni
      </button>
    </div>
  );
};

export default HistoryView;
