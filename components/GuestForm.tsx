
import React, { useState, useEffect, useRef } from 'react';
import { GuestData, DocumentType, Gender } from '../types';

interface SearchableSelectProps {
  label: string;
  options: any[];
  value: string;
  onChange: (value: string) => void;
  displayKey: string;
  valueKey: string;
  placeholder?: string;
  disabled?: boolean;
  hasWarning?: boolean;
  showSearch?: boolean;
}

const cyrToLatMap: { [key: string]: string } = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'ђ': 'dj', 'е': 'e', 'ж': 'z', 'з': 'z', 'и': 'i',
  'ј': 'j', 'к': 'k', 'л': 'l', 'љ': 'lj', 'м': 'm', 'н': 'n', 'њ': 'nj', 'о': 'o', 'п': 'p', 'р': 'r',
  'с': 's', 'т': 't', 'ћ': 'c', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'c', 'џ': 'dz', 'ш': 's'
};

const SearchableSelect: React.FC<SearchableSelectProps> = ({ 
  label, options, value, onChange, displayKey, valueKey, placeholder = "-- Izaberite --", disabled, hasWarning, showSearch = true 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const normalize = (str: string) => {
    if (!str) return '';
    let s = String(str).toLowerCase();
    let res = '';
    for (const char of s) {
      res += cyrToLatMap[char] || char;
    }
    return res.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  };

  const filteredOptions = Array.isArray(options) ? options.filter(opt => 
    normalize(opt[displayKey]).includes(normalize(search))
  ) : [];

  const selectedOption = Array.isArray(options) ? options.find(opt => String(opt[valueKey]) === String(value)) : null;

  const labelClass = "block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1";
  const inputClass = "w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm dark:text-slate-100 cursor-pointer flex justify-between items-center";
  const warningInputClass = "w-full p-2.5 bg-amber-50 dark:bg-amber-900/10 border border-amber-300 dark:border-amber-700/50 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all text-sm dark:text-slate-100 cursor-pointer flex justify-between items-center";

  return (
    <div className="relative" ref={wrapperRef}>
      <label className={labelClass}>
        {label} {hasWarning && <i className="fas fa-exclamation-triangle text-amber-500 ml-1"></i>}
      </label>
      <div 
        className={`${hasWarning ? warningInputClass : inputClass} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span className={selectedOption ? '' : 'text-slate-400'}>
          {selectedOption ? selectedOption[displayKey] : placeholder}
        </span>
        <i className={`fas fa-chevron-down text-xs transition-transform ${isOpen ? 'rotate-180' : ''}`}></i>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-200">
          {showSearch && (
            <div className="sticky top-0 p-2 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">
              <input
                autoFocus
                className="w-full p-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-100"
                placeholder="Pretraži..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
          <div className="py-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt, index) => (
                <div
                  key={`${opt[valueKey]}-${index}`}
                  className={`px-4 py-2 text-sm cursor-pointer text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 ${String(opt[valueKey]) === String(value) ? 'bg-indigo-100 dark:bg-indigo-900/60 font-bold' : ''}`}
                  onClick={() => {
                    onChange(String(opt[valueKey]));
                    setIsOpen(false);
                    setSearch('');
                  }}
                >
                  {opt[displayKey]}
                </div>
              ))
            ) : (
              <div className="px-4 py-2 text-sm text-slate-400 italic">Nema rezultata</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface GuestFormProps {
  initialData: GuestData;
  onSubmit: (data: GuestData) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  submitLabel?: string;
  sessionToken: string;
}

const GuestForm: React.FC<GuestFormProps> = ({ initialData, onSubmit, onCancel, isSubmitting, submitLabel = "Registruj gosta", sessionToken }) => {
  const [data, setData] = useState<GuestData>(initialData);
  const [countries, setCountries] = useState<any[]>([]);
  const [municipalities, setMunicipalities] = useState<any[]>([]);
  const [places, setPlaces] = useState<any[]>([]);
  const [serviceTypes, setServiceTypes] = useState<any[]>([]);
  const [arrivalModes, setArrivalModes] = useState<any[]>([]);
  const [stayReasons, setStayReasons] = useState<any[]>([]);
  const [entryPlaces, setEntryPlaces] = useState<any[]>([]);

  const normalize = (str: string) => {
    if (!str) return '';
    let s = String(str).toLowerCase();
    let res = '';
    for (const char of s) {
      res += cyrToLatMap[char] || char;
    }
    return res.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  };

  const validateJMBG = (jmbg: string): boolean => {
    if (!/^\d{13}$/.test(jmbg)) return false;
    const a = jmbg.split('').map(Number);
    const sum = 7 * (a[0] + a[6]) + 6 * (a[1] + a[7]) + 5 * (a[2] + a[8]) + 4 * (a[3] + a[9]) + 3 * (a[4] + a[10]) + 2 * (a[5] + a[11]);
    const k = 11 - (sum % 11);
    const checksum = k > 9 ? 0 : k;
    return a[12] === checksum;
  };

  const findBestMatch = (searchStr: string, options: any[], displayKey: string) => {
    if (!searchStr) return null;
    const s = searchStr.toUpperCase();
    const normalizedS = normalize(s).toUpperCase();
    
    // 1. Check if it's a code (for countries)
    if (s.length === 3) {
      const codeMatch = options.find(opt => String(opt.Kod3 || opt.Id || '').toUpperCase() === s);
      if (codeMatch) return codeMatch;
    }

    // 2. Exact match
    let match = options.find(opt => {
      const name = String(opt[displayKey]).toUpperCase();
      const latin = normalize(name).toUpperCase();
      return s === name || normalizedS === latin;
    });
    if (match) return match;

    // 3. Word match or in parentheses
    match = options.find(opt => {
      const name = String(opt[displayKey]).toUpperCase();
      const latin = normalize(name).toUpperCase();
      const regex = new RegExp(`\\b${normalizedS}\\b|\\(${normalizedS}\\)`, 'i');
      return regex.test(name) || regex.test(latin);
    });
    if (match) return match;

    // 4. Starts with
    match = options.find(opt => {
      const name = String(opt[displayKey]).toUpperCase();
      const latin = normalize(name).toUpperCase();
      return name.startsWith(s) || latin.startsWith(normalizedS);
    });
    if (match) return match;

    // 5. Includes
    return options.find(opt => {
      const name = String(opt[displayKey]).toUpperCase();
      const latin = normalize(name).toUpperCase();
      return name.includes(s) || latin.includes(normalizedS);
    });
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const headers = { 'Authorization': sessionToken };
        const [countriesRes, municipalitiesRes, serviceTypesRes, arrivalModesRes, stayReasonsRes, entryPlacesRes] = await Promise.all([
          fetch('/api/db/countries', { headers }).then(res => res.json()).then(data => Array.isArray(data) ? data : []),
          fetch('/api/db/municipalities', { headers }).then(res => res.json()).then(data => Array.isArray(data) ? data : []),
          fetch('/api/db/service-types', { headers }).then(res => res.json()).then(data => Array.isArray(data) ? data : []),
          fetch('/api/db/arrival-modes', { headers }).then(res => res.json()).then(data => Array.isArray(data) ? data : []),
          fetch('/api/db/stay-reasons', { headers }).then(res => res.json()).then(data => Array.isArray(data) ? data : []),
          fetch('/api/db/entry-places', { headers }).then(res => res.json()).then(data => Array.isArray(data) ? data : [])
        ]);

        setCountries(countriesRes);
        setMunicipalities(municipalitiesRes);
        setServiceTypes(serviceTypesRes);
        setArrivalModes(arrivalModesRes);
        setStayReasons(stayReasonsRes);
        setEntryPlaces(entryPlacesRes);

        // Auto-select Country of Birth
        let matchedCountryCode = 'SRB';
        if (initialData.countryOfBirth) {
          const match = findBestMatch(initialData.countryOfBirth, countriesRes, 'Cirlica');
          if (match) matchedCountryCode = match.Kod3;
        }

        // Auto-select Municipality
        let matchedMunicipalityId = '';
        const mSearch = (initialData.municipalityOfResidence || initialData.municipalityOfBirth || initialData.placeOfBirth || initialData.issuingAuthority || '').trim();
        console.log('Auto-select municipality search string:', mSearch);
        
        if (mSearch) {
          const match = findBestMatch(mSearch, municipalitiesRes, 'Naziv');
          if (match) {
            console.log('Matched municipality:', match);
            matchedMunicipalityId = String(match["Maticni Broj"]);
          } else {
            console.warn('No municipality match found for:', mSearch);
          }
        }

        // Set defaults if not present
        setData(prev => {
          // If residence fields are strings (from AI), they need to be replaced by IDs
          const currentMuni = prev.municipalityOfResidence || '';
          const muniId = (!currentMuni || isNaN(Number(currentMuni))) ? matchedMunicipalityId : currentMuni;

          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const tomorrowStr = tomorrow.toISOString().split('T')[0];

          return {
            ...prev,
            countryOfBirth: prev.countryOfBirth || matchedCountryCode,
            residenceCountry: prev.residenceCountry || (prev.isDomestic ? 'SRB' : ''),
            municipalityOfResidence: muniId,
            serviceType: prev.serviceType || '1',
            arrivalMode: prev.arrivalMode || '1',
            stayReason: prev.stayReason || '4',
            arrivalDate: prev.arrivalDate || new Date().toISOString().split('T')[0],
            arrivalTime: prev.arrivalTime || new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
            plannedDepartureDate: prev.plannedDepartureDate || tomorrowStr
          };
        });
      } catch (error) {
        console.error("Failed to fetch dropdown data", error);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    const fetchPlaces = async () => {
      if (data.municipalityOfResidence) {
        try {
          const res = await fetch(`/api/db/places/${data.municipalityOfResidence}`, {
            headers: { 'Authorization': sessionToken }
          });
          const placesData = await res.json();
          const pData = Array.isArray(placesData) ? placesData : [];
          setPlaces(pData);

          // Try to match placeOfResidence or placeOfBirth
          const pSearch = (initialData.placeOfResidence || initialData.placeOfBirth || '').trim();
          console.log('Auto-select place search string:', pSearch);
          
          if (pSearch) {
            setData(prev => {
              // If already has a numeric ID, don't overwrite unless it was just the string name
              if (prev.placeOfResidence && !isNaN(Number(prev.placeOfResidence))) {
                 return prev;
              }
              const match = findBestMatch(pSearch, pData, 'Naziv Mesta');
              if (match) {
                console.log('Matched place:', match);
                return { ...prev, placeOfResidence: String(match["Maticni Broj Mesta"]) };
              }
              console.warn('No place match found for:', pSearch);
              return prev;
            });
          }
        } catch (error) {
          console.error("Failed to fetch places", error);
        }
      } else {
        setPlaces([]);
      }
    };
    fetchPlaces();
  }, [data.municipalityOfResidence]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(data);
  };

  const inputClass = "w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm dark:text-slate-100";
  const warningInputClass = "w-full p-2.5 bg-amber-50 dark:bg-amber-900/10 border border-amber-300 dark:border-amber-700/50 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all text-sm dark:text-slate-100";
  const labelClass = "block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1";

  const dateInputClass = `${inputClass} appearance-none cursor-pointer`;
  const warningDateInputClass = `${warningInputClass} appearance-none cursor-pointer`;

  const missingFields = [];
  if (!data.firstName) missingFields.push("Ime");
  if (!data.lastName) missingFields.push("Prezime");
  if (!data.dateOfBirth) missingFields.push("Datum rođenja");
  if (data.isDomestic && !data.jmbg) missingFields.push("JMBG");
  if (!data.countryOfBirth) missingFields.push("Država rođenja");
  if (!data.residenceCountry) missingFields.push("Država prebivališta");
  if (!data.municipalityOfResidence) missingFields.push("Opština prebivališta");
  if (!data.placeOfResidence) missingFields.push("Mesto prebivališta");

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Pregled podataka</h2>
          {data.rawMrz ? (
            <div className="flex items-center space-x-1.5 text-emerald-600 dark:text-emerald-400 mt-0.5">
              <i className="fas fa-shield-check text-xs"></i>
              <span className="text-[10px] font-bold uppercase tracking-tight">Spreman za prijavu</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 text-amber-600 dark:text-amber-400 mt-0.5">
              <i className="fas fa-exclamation-triangle text-xs"></i>
              <span className="text-[10px] font-bold uppercase tracking-tight">Ručna provera obavezna</span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-semibold"
        >
          Ponovi skeniranje
        </button>
      </div>

      {missingFields.length > 0 && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-2xl flex items-start space-x-3 animate-in fade-in slide-in-from-top-2">
          <div className="mt-0.5">
            <i className="fas fa-exclamation-circle text-amber-500"></i>
          </div>
          <div>
            <h4 className="text-sm font-bold text-amber-800 dark:text-amber-400">Nedostaju podaci</h4>
            <p className="text-xs text-amber-700/80 dark:text-amber-500/80 mt-0.5">
              Neki podaci nisu uspešno izvučeni sa slike. Molimo vas da ručno popunite sledeća polja: 
              <span className="font-bold ml-1">{missingFields.join(", ")}</span>.
            </p>
          </div>
        </div>
      )}

      {/* Osnovni Podaci */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2 pb-1 border-b border-slate-100 dark:border-slate-800">
          <i className="fas fa-user text-indigo-500 text-xs"></i>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Osnovni Podaci</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-4">
          <div className="md:col-span-1">
            <label className={labelClass}>
              Ime {!data.firstName && <i className="fas fa-exclamation-triangle text-amber-500 ml-1"></i>}
            </label>
            <input name="firstName" value={data.firstName} onChange={handleChange} className={!data.firstName ? warningInputClass : inputClass} required />
          </div>
          <div className="md:col-span-1">
            <label className={labelClass}>
              Prezime {!data.lastName && <i className="fas fa-exclamation-triangle text-amber-500 ml-1"></i>}
            </label>
            <input name="lastName" value={data.lastName} onChange={handleChange} className={!data.lastName ? warningInputClass : inputClass} required />
          </div>
          <div>
            <label className={labelClass}>
              Datum rođenja {!data.dateOfBirth && <i className="fas fa-exclamation-triangle text-amber-500 ml-1"></i>}
            </label>
            <input type="date" name="dateOfBirth" value={data.dateOfBirth} onChange={handleChange} className={!data.dateOfBirth ? warningDateInputClass : dateInputClass} required />
          </div>
          <div>
            <label className={labelClass}>Pol</label>
            <select name="gender" value={data.gender} onChange={handleChange} className={inputClass}>
              {Object.values(Gender).map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          <div>
            <label className={labelClass}>
              JMBG {(data.isDomestic && !data.jmbg) && <i className="fas fa-exclamation-triangle text-amber-500 ml-1"></i>}
            </label>
            <div className="relative">
              <input 
                name="jmbg" 
                value={data.jmbg || ''} 
                onChange={handleChange} 
                className={`${(data.isDomestic && !data.jmbg) ? warningInputClass : inputClass} ${data.jmbg && !validateJMBG(data.jmbg) ? 'border-red-500 focus:ring-red-500' : ''}`} 
                maxLength={13} 
              />
              {data.jmbg && !validateJMBG(data.jmbg) && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <i className="fas fa-times-circle text-red-500"></i>
                </div>
              )}
            </div>
            {data.jmbg && !validateJMBG(data.jmbg) && (
              <p className="text-[10px] text-red-500 font-bold mt-1">Neispravan JMBG format</p>
            )}
          </div>

          <SearchableSelect
            label="Država rođenja"
            options={countries}
            value={data.countryOfBirth}
            onChange={(val) => setData(prev => ({ ...prev, countryOfBirth: val }))}
            displayKey="Cirlica"
            valueKey="Kod3"
            hasWarning={!data.countryOfBirth}
          />

          <SearchableSelect
            label="Država prebivališta"
            options={countries}
            value={data.residenceCountry || ''}
            onChange={(val) => setData(prev => ({ ...prev, residenceCountry: val }))}
            displayKey="Cirlica"
            valueKey="Kod3"
            hasWarning={!data.residenceCountry}
          />

          <SearchableSelect
            label="Opština prebivališta"
            options={municipalities}
            value={data.municipalityOfResidence || ''}
            onChange={(val) => setData(prev => ({ ...prev, municipalityOfResidence: val, placeOfResidence: '' }))}
            displayKey="Naziv"
            valueKey="Maticni Broj"
            hasWarning={!data.municipalityOfResidence}
          />

          <SearchableSelect
            label="Mesto prebivališta"
            options={places}
            value={data.placeOfResidence || ''}
            onChange={(val) => setData(prev => ({ ...prev, placeOfResidence: val }))}
            displayKey="Naziv Mesta"
            valueKey="Maticni Broj Mesta"
            disabled={!data.municipalityOfResidence}
            hasWarning={!data.placeOfResidence}
          />

          <div>
            <label className={labelClass}>Važenje dokumenta</label>
            <input type="date" name="expiryDate" value={data.expiryDate} onChange={handleChange} className={!data.expiryDate ? warningDateInputClass : dateInputClass} />
          </div>

          {!data.isDomestic && (
            <>
              <div>
                <label className={labelClass}>Datum izdavanja dokumenta</label>
                <input type="date" name="documentIssueDate" value={data.documentIssueDate || ''} onChange={handleChange} className={dateInputClass} />
              </div>
              <div>
                <label className={labelClass}>Datum ulaska u Srbiju</label>
                <input type="date" name="entryDateToSerbia" value={data.entryDateToSerbia || ''} onChange={handleChange} className={dateInputClass} />
              </div>
              <SearchableSelect
                label="Mesto ulaska u Srbiju"
                options={entryPlaces}
                value={data.entryPlaceToSerbia || ''}
                onChange={(val) => setData(prev => ({ ...prev, entryPlaceToSerbia: val }))}
                displayKey="Naziv"
                valueKey="Id"
              />
            </>
          )}
        </div>
      </div>

      {/* Podaci o boravku */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2 pb-1 border-b border-slate-100 dark:border-slate-800">
          <i className="fas fa-calendar-check text-indigo-500 text-xs"></i>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Podaci o boravku</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-4">
          <SearchableSelect
            label="Vrsta pruženih usluga"
            options={serviceTypes}
            value={data.serviceType || ''}
            onChange={(val) => setData(prev => ({ ...prev, serviceType: val }))}
            displayKey="Naziv"
            valueKey="Id"
            showSearch={false}
          />

          <SearchableSelect
            label="Način dolaska"
            options={arrivalModes}
            value={data.arrivalMode || ''}
            onChange={(val) => setData(prev => ({ ...prev, arrivalMode: val }))}
            displayKey="Naziv"
            valueKey="Id"
            showSearch={false}
          />

          <SearchableSelect
            label="Primarni motiv dolaska"
            options={stayReasons}
            value={data.stayReason || ''}
            onChange={(val) => setData(prev => ({ ...prev, stayReason: val }))}
            displayKey="Naziv"
            valueKey="Id"
            showSearch={false}
          />

          <div>
            <label className={labelClass}>Datum dolaska</label>
            <input type="date" name="arrivalDate" value={data.arrivalDate} onChange={handleChange} className={dateInputClass} required />
          </div>

          <div>
            <label className={labelClass}>Čas dolaska (24h)</label>
            <div className="relative">
              <input 
                type="time" 
                name="arrivalTime" 
                value={data.arrivalTime || ''} 
                onChange={handleChange} 
                className={dateInputClass} 
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <i className="far fa-clock"></i>
              </div>
            </div>
          </div>

          <div>
            <label className={labelClass}>Planirani datum odlaska</label>
            <input type="date" name="plannedDepartureDate" value={data.plannedDepartureDate || ''} onChange={handleChange} className={dateInputClass} />
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className={`w-full py-4 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 transition-all flex items-center justify-center space-x-2 ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
      >
        {isSubmitting ? (
          <>
            <i className="fas fa-spinner fa-spin"></i>
            <span>Obrađivanje...</span>
          </>
        ) : (
          <>
            <i className="fas fa-arrow-right"></i>
            <span>{submitLabel}</span>
          </>
        )}
      </button>
    </form>
  );
};

export default GuestForm;
