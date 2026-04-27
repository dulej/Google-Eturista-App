
import React, { useEffect, useState } from 'react';
import { Calendar, User, FileText, MapPin, Clock, Trash2, ChevronRight, Search, Database, Table as TableIcon, ExternalLink, LogOut } from 'lucide-react';
import { getRegisteredGuests, checkoutGuest } from '../services/geminiService';

interface HistoryViewProps {
  onBack: () => void;
  sessionToken: string;
  id: string | number;
  jid: string;
  environment: 'test' | 'prod';
}

const HistoryView: React.FC<HistoryViewProps> = ({ onBack, sessionToken, id, jid, environment }) => {
  const [viewMode, setViewMode] = useState<'entries' | 'db'>('entries');
  const [entries, setEntries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Filters for eTurista
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30); // Default to 30 days ago for more history
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [selectedStatus, setSelectedStatus] = useState<number | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const pageSize = 10;
  const [totalRows, setTotalRows] = useState(0);

  // DB Explorer state
  const [tables, setTables] = useState<{name: string, count: number}[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<any[]>([]);
  const [isDbLoading, setIsDbLoading] = useState(false);
  const [checkoutLoadingId, setCheckoutLoadingId] = useState<number | string | null>(null);
  const [lastApiResponse, setLastApiResponse] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);

  const clearDebug = () => {
    setLastApiResponse(null);
    setShowDebug(false);
  };

  const handleCheckout = async (e: React.MouseEvent, entry: any) => {
    e.preventDefault();
    e.stopPropagation();
    console.log("handleCheckout triggered for entry:", entry);

    // Robust ID extraction from eTurista guest object
    const tId = entry.turistaId ?? entry.TuristaId ?? entry.id ?? entry.Id ?? entry.identifikator ?? entry.Identifikator;

    setShowDebug(true);
    setLastApiResponse({ 
      endpoint: 'CheckOut', 
      status: 'Pokušaj odjave...', 
      payload: { entry, tId_raw: tId },
      timestamp: new Date().toLocaleTimeString()
    });
    
    if (!tId) {
      console.warn("Missing Guest ID for checkout. Entry:", entry);
      setLastApiResponse(prev => ({ 
        ...prev,
        status: 'GREŠKA',
        error: "Nedostaje ID gosta u podacima sa eTurista servera."
      }));
      setError("Greška: Nedostaje ID gosta.");
      return;
    }

    setCheckoutLoadingId(tId);
    console.log("Starting checkout process for ID:", tId);
    
    const docNum = (entry.brojIsprave || entry.BrojIsprave || entry.jmbg || entry.Jmbg || entry.brojPutneIsprave || entry.BrojPutneIsprave || "").replace(/'/g, "''");
    const name = (entry.imeIPrezime || entry.ImeIPrezime || "").trim().replace(/'/g, "''");
    let guestData = null;

    try {
      setLastApiResponse(prev => ({ ...prev, status: 'Traženje podataka u lokalnoj bazi...' }));
      // 1. Fetch full guest details from local DB to get correct Sifra and JID
      try {
        const safeTid = String(tId).replace(/'/g, "''");
        
        // Try multiple ways to find the guest in our local DB
        // eTurista 'ImeIPrezime' can be 'Ime Prezime' or 'Prezime Ime'
        let queryStr = `
          SELECT ExternalId, UgostiteljskiObjekatJedinstveniIdentifikator, VrstaPruzenihUslugaSifra 
          FROM Gost_v4 
          WHERE InternalId = '${safeTid}' OR ExternalId = '${safeTid}'
        `;
        
        if (name) {
          queryStr += ` OR (Ime || ' ' || Prezime = '${name}' OR Prezime || ' ' || Ime = '${name}')`;
        }

        if (docNum && docNum.length > 3) {
          queryStr += ` OR (BrojPutneIsprave = '${docNum}' OR Jmbg = '${docNum}')`;
        }
        
        queryStr += " LIMIT 1";
        
        console.log(`[Checkout] DB Lookup Query: ${queryStr}`);
        
        const localRes = await fetch(`/api/db/query?q=${encodeURIComponent(queryStr)}`, {
          headers: { 'Authorization': sessionToken }
        });
        
        if (localRes.ok) {
          const data = await localRes.json();
          if (data && data[0]) {
            guestData = data[0];
            console.log("Found guest in local DB:", guestData);
          }
        }
      } catch (e) {
        console.warn("Local DB lookup failed for checkout details", e);
      }

      if (!guestData) {
        const searchInfo = `ID:${tId}, Ime:${name}, Dok:${docNum}`;
        setLastApiResponse(prev => ({ 
          ...prev, 
          status: 'GREŠKA', 
          error: `Gost nije pronađen u lokalnoj bazi podataka. (Pretraga: ${searchInfo})` 
        }));
        setError(`Gost nije pronađen u lokalnoj bazi (Pretraga: ${searchInfo}). Odjava je moguća samo za goste koji su prijavljeni putem ove aplikacije.`);
        setCheckoutLoadingId(null);
        return;
      }

      setLastApiResponse(prev => ({ ...prev, status: 'Slanje API zahteva na eTurista...' }));
      const now = new Date();
      // Subtract 1 minute to ensure we never send a "future" timestamp due to slight clock skew
      const bufferedNow = new Date(now.getTime() - 60000);
      
      const year = bufferedNow.getFullYear();
      const month = String(bufferedNow.getMonth() + 1).padStart(2, '0');
      const day = String(bufferedNow.getDate()).padStart(2, '0');
      const hours = String(bufferedNow.getHours()).padStart(2, '0');
      const minutes = String(bufferedNow.getMinutes()).padStart(2, '0');
      const localFormattedTime = `${year}-${month}-${day} ${hours}:${minutes}`;

      const payload = {
        Izmena: "false",
        DatumICasOdjave: localFormattedTime,
        // Using strict data from DB
        BrojPruzenihUslugaSmestaja: String(guestData.VrstaPruzenihUslugaSifra || "1"), 
        UgostiteljskiObjekatJedinstveniIdentifikator: String(guestData.UgostiteljskiObjekatJedinstveniIdentifikator || jid || entry.UgostiteljskiObjekatJedinstveniIdentifikator), 
        ExternalId: String(guestData.ExternalId || entry.turistaId || entry.TuristaId),
        TuristaId: String(guestData.InternalId || entry.turistaId || entry.TuristaId)
      };

      setLastApiResponse(prev => ({ ...prev, payload })); // Update debug with final payload

      const result = await checkoutGuest(sessionToken, payload, environment);
      console.log("Checkout successful. Payload:", payload, "Result:", result);
      setLastApiResponse({ 
        endpoint: 'CheckOut', 
        status: 'USPEŠNO',
        payload, 
        result,
        timestamp: new Date().toLocaleTimeString()
      });
      fetchHistory(); // Refresh list
    } catch (err: any) {
      console.error("Checkout failed:", err);
      setLastApiResponse({ 
        endpoint: 'CheckOut', 
        status: 'GREŠKA',
        error: err.message,
        timestamp: new Date().toLocaleTimeString()
      });
      setError(err.message || "Neuspešna odjava gosta.");
    } finally {
      setCheckoutLoadingId(null);
    }
  };

  const fetchHistory = React.useCallback(() => {
    setIsLoading(true);
    setError(null);
    
    const payload = {
      ugostiteljskiObjekatIds: [Number(id)],
      ime: null,
      prezime: null,
      tipLica: [],
      turistaStatusIds: selectedStatus !== null ? [selectedStatus] : [],
      objekatStatusIds: [],
      datumIvremeDolaskaOd: `${dateFrom}T00:00:00.000Z`,
      datumIvremeDolaskaDo: `${dateTo}T23:59:59.000Z`,
      datumIvremeOdlaskaOd: null,
      datumIvremeOdlaskaDo: null,
      planiraniDatumOdlaska: null,
      pageIndex: pageIndex,
      pageSize: pageSize
    };

    getRegisteredGuests(sessionToken, payload, environment)
      .then(data => {
        // Data structure: { data: [], totalRowsCount: 0 }
        console.log("Search results fetched:", data);
        setLastApiResponse({ endpoint: 'SearchGuests', payload, result: data });
        let items = data.data || [];
        setTotalRows(data.totalRowsCount || items.length);

        // Sort: Active (Prijavljen) guests first
        items = [...items].sort((a, b) => {
          const statusA = a.turistaStatusId ?? a.TuristaStatusId;
          const statusB = b.turistaStatusId ?? b.TuristaStatusId;
          if (statusA === 1 && statusB !== 1) return -1;
          if (statusA !== 1 && statusB === 1) return 1;
          return 0;
        });

        setEntries(items);
        setIsLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch history:", err);
        setError(err.message || "Neuspešno preuzimanje istorije iz eTurista.");
        setIsLoading(false);
      });
  }, [sessionToken, id, dateFrom, dateTo, selectedStatus, pageIndex, pageSize]);

  useEffect(() => {
    if (viewMode === "entries") {
      fetchHistory();
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
  }, [viewMode, sessionToken, fetchHistory]);

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
  }, [selectedTable, viewMode, sessionToken]);

  const filteredEntries = entries.filter(e => {
    const imeIPrezime = (e.imeIPrezime || e.ImeIPrezime || "").toLowerCase();
    const doc = (e.brojIsprave || e.BrojIsprave || e.jmbg || e.Jmbg || e.identifikacija || "").toLowerCase();
    const search = searchTerm.toLowerCase();
    return imeIPrezime.includes(search) || doc.includes(search);
  });

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    try {
      return new Date(dateStr).toLocaleDateString('sr-RS', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* API DEBUG BOX AT THE TOP */}
      {(lastApiResponse || showDebug) && (
        <div className="bg-[#1e293b] p-3 rounded-2xl border-4 border-indigo-500/30 overflow-hidden shadow-2xl">
          <div className="flex items-center justify-between mb-2">
             <div className="flex items-center gap-2 text-indigo-400">
               <Database size={16} />
               <span className="text-[10px] font-black uppercase tracking-widest">eTurista API Logs</span>
               {lastApiResponse?.status && (
                 <span className={`text-[8px] px-2 py-0.5 rounded-full ml-2 ${
                   lastApiResponse.status === 'USPEŠNO' ? 'bg-emerald-500/20 text-emerald-400' : 
                   lastApiResponse.status === 'GREŠKA' ? 'bg-red-500/20 text-red-400' : 
                   'bg-indigo-500/20 text-indigo-300'
                 }`}>
                   {lastApiResponse.status} {lastApiResponse.timestamp && `@ ${lastApiResponse.timestamp}`}
                 </span>
               )}
             </div>
             <button onClick={clearDebug} className="text-slate-500 hover:text-white text-xs">Zatvori</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <p className="text-[8px] font-bold text-slate-500 uppercase mb-1">Payload (Poslato):</p>
              <textarea 
                className="w-full h-32 bg-black/50 rounded-xl p-2 text-emerald-400 font-mono text-[10px] border border-slate-700/50 resize-none outline-none"
                readOnly
                placeholder="Nema podataka..."
                value={lastApiResponse ? JSON.stringify(lastApiResponse.payload, null, 2) : ""}
              ></textarea>
            </div>
            <div>
              <p className="text-[8px] font-bold text-slate-500 uppercase mb-1">Response (Odgovor):</p>
              <textarea 
                className="w-full h-32 bg-black/50 rounded-xl p-2 text-indigo-300 font-mono text-[10px] border border-slate-700/50 resize-none outline-none"
                readOnly
                placeholder="Čekanje na API poziv..."
                value={lastApiResponse ? JSON.stringify(lastApiResponse.result || lastApiResponse.error, null, 2) : ""}
              ></textarea>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center">
            <span className="bg-indigo-600 text-white p-2 rounded-xl mr-3 shadow-lg shadow-indigo-200 dark:shadow-none">
              <Clock size={24} />
            </span>
            Istorija prijava
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
            {viewMode === 'entries' 
              ? 'Real-time podaci direktno iz eTurista.' 
              : 'Pregled lokalnih referentnih podataka.'}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => setShowDebug(!showDebug)}
            className={`p-2 rounded-xl transition-all ${showDebug ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400 hover:text-slate-600'}`}
            title="Debug API"
          >
            <Database size={18} />
          </button>
          <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl flex">
            <button 
              onClick={() => setViewMode('entries')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'entries' ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}`}
            >
              eTurista
            </button>
            <button 
              onClick={() => setViewMode('db')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'db' ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}`}
            >
              Lokalna DB
            </button>
          </div>
          <button 
            onClick={onBack}
            className="p-2.2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-2xl text-xs font-bold border border-red-100 dark:border-red-900/50">
          <i className="fas fa-exclamation-circle mr-2" />
          {error}
        </div>
      )}

      {viewMode === 'entries' ? (
        <>
          <div className="bg-white dark:bg-slate-800 p-4 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Dolazak Od</label>
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="date"
                    value={dateFrom}
                    onChange={(e) => { setDateFrom(e.target.value); setPageIndex(0); }}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 transition-all dark:text-slate-100"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Dolazak Do</label>
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="date"
                    value={dateTo}
                    onChange={(e) => { setDateTo(e.target.value); setPageIndex(0); }}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 transition-all dark:text-slate-100"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Status Gostiju</label>
                <select 
                  value={selectedStatus === null ? "" : selectedStatus}
                  onChange={(e) => { setSelectedStatus(e.target.value === "" ? null : Number(e.target.value)); setPageIndex(0); }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 transition-all dark:text-slate-100 appearance-none"
                >
                  <option value="">Svi statusi</option>
                  <option value="1">Prijavljen</option>
                  <option value="2">Odjavljen</option>
                </select>
              </div>
            </div>
            
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <Search size={18} />
              </div>
              <div className="flex gap-2">
                <input 
                  type="text"
                  placeholder="Pretraži (Ime, Prezime, JMBG, Passport)..."
                  className="flex-1 pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none dark:text-slate-100"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <button 
                  onClick={() => { setPageIndex(0); fetchHistory(); }}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-indigo-200 dark:shadow-none flex items-center gap-2"
                >
                  <Clock size={18} />
                  <span className="hidden sm:inline">Osveži</span>
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 mt-4">
            {isLoading ? (
              <div className="py-20 text-center space-y-4">
                <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">Preuzimanje iz eTuriste...</p>
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="py-20 text-center space-y-4 bg-slate-50 dark:bg-slate-800/30 rounded-[2rem] border-2 border-dashed border-slate-200 dark:border-slate-700">
                <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto text-slate-300 shadow-sm border border-slate-100 dark:border-slate-700">
                  <Clock size={32} />
                </div>
                <p className="text-slate-500 dark:text-slate-400 font-medium">Nema registrovanih gostiju za ove kriterijume.</p>
              </div>
            ) : (
              <>
                {filteredEntries.map((entry, idx) => (
                  <div 
                    key={entry.turistaId ?? entry.TuristaId ?? idx}
                    className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 rounded-2xl shadow-sm hover:shadow-md transition-all group"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center">
                          <User size={20} />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-800 dark:text-slate-100 uppercase">
                            {entry.imeIPrezime || entry.ImeIPrezime || 'Nepoznat Gost'}
                          </h4>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-black tracking-wider">
                            Identifikacija: {entry.brojIsprave || entry.BrojIsprave || entry.jmbg || entry.Jmbg || 'N/A'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end gap-2">
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-tighter block">Status</span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                            (String(entry.turistaStatusId) === '1' || String(entry.TuristaStatusId) === '1') ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {(String(entry.turistaStatusId) === '1' || String(entry.TuristaStatusId) === '1') ? 'Prijavljen' : (entry.turistaStatusNaziv || entry.TuristaStatusNaziv || 'Odjavljen')}
                          </span>
                        </div>
                        {(String(entry.turistaStatusId) === '1' || String(entry.TuristaStatusId) === '1') && (
                          <button
                            onClick={(e) => handleCheckout(e, entry)}
                            disabled={checkoutLoadingId === (entry.turistaId ?? entry.TuristaId ?? entry.id ?? entry.Id ?? entry.identifikator ?? entry.Identifikator)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-[10px] font-black uppercase transition-all disabled:opacity-50"
                          >
                            {checkoutLoadingId === (entry.turistaId ?? entry.TuristaId ?? entry.id ?? entry.Id ?? entry.identifikator ?? entry.Identifikator) ? (
                              <div className="w-3 h-3 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <LogOut size={12} />
                            )}
                            Odjavi
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-50 dark:border-slate-700/50">
                      <div className="space-y-1">
                        <span className="text-[8px] font-bold text-slate-400 uppercase">Dolazak</span>
                        <div className="flex items-center space-x-2 text-[10px] text-slate-600 dark:text-slate-300">
                          <Calendar size={12} className="text-slate-300" />
                          <span>{formatDate(entry.datumIVremeDolaska || entry.DatumIVremeDolaska)}</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[8px] font-bold text-slate-400 uppercase">Odlazak</span>
                        <div className="flex items-center space-x-2 text-[10px] text-slate-600 dark:text-slate-300">
                          <Calendar size={12} className="text-slate-300" />
                          <span>{formatDate(entry.datumIVremeOdlaska || entry.DatumIVremeOdlaska || entry.datumKreiranjaOdjave || entry.DatumKreiranjaOdjave)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Pagination Controls */}
                <div className="flex items-center justify-between pt-4 pb-2 px-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase">
                    Ukupno: {totalRows} | Strana {pageIndex + 1}
                  </span>
                  <div className="flex gap-2">
                    <button 
                      disabled={pageIndex === 0}
                      onClick={() => setPageIndex(p => Math.max(0, p - 1))}
                      className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 disabled:opacity-30 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 transition-all"
                    >
                      Prethodna
                    </button>
                    <button 
                      disabled={(pageIndex + 1) * pageSize >= totalRows}
                      onClick={() => setPageIndex(p => p + 1)}
                      className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 disabled:opacity-30 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 transition-all"
                    >
                      Sledeća
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {tables.map(t => (
              <button
                key={t.name}
                onClick={() => setSelectedTable(t.name)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${selectedTable === t.name ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}`}
              >
                <TableIcon size={14} />
                <span>{t.name}</span>
                <span className="opacity-50 font-black">({t.count})</span>
              </button>
            ))}
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-100 dark:border-slate-700 overflow-hidden shadow-sm">
            {isDbLoading ? (
              <div className="py-20 text-center">
                <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-slate-400 text-xs font-bold uppercase">Učitavanje podataka...</p>
              </div>
            ) : !selectedTable ? (
              <div className="py-20 text-center text-slate-400 italic text-sm">Izaberite tabelu za pregled.</div>
            ) : (
              <>
                <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                  <span className="text-[10px] font-black text-slate-500 uppercase">Tabela: {selectedTable}</span>
                  <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase">Prikazano: {tableData.length}</span>
                </div>
                <div className="overflow-x-auto max-h-[400px] custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50">
                      {tableData.length > 0 && Object.keys(tableData[0]).map(k => (
                        <th key={k} className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase border-b border-slate-100 dark:border-slate-800">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                        {Object.values(row).map((v: any, j) => (
                          <td key={j} className="px-4 py-2 text-[10px] text-slate-600 dark:text-slate-300 border-b border-slate-50 dark:border-slate-700/50 truncate max-w-[150px]">
                            {String(v)}
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
        className="w-full py-4 bg-slate-900 dark:bg-slate-800 text-white font-bold rounded-2xl hover:bg-black transition-all flex items-center justify-center space-x-2"
      >
        <ChevronRight size={18} className="rotate-180" />
        <span>Nazad na kontrolnu tablu</span>
      </button>
    </div>
  );
};

export default HistoryView;
