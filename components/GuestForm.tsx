
import React, { useState, useEffect, useMemo } from 'react';
import { GuestData, DocumentType, Gender } from '../types';
import { getGradovi } from '../services/geminiService';

interface GuestFormProps {
  initialData: GuestData;
  onSubmit: (data: GuestData) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  submitLabel?: string;
  sessionToken: string;
}

const GuestForm: React.FC<GuestFormProps> = ({ initialData, onSubmit, onCancel, isSubmitting, submitLabel = "Register Guest", sessionToken }) => {
  const [data, setData] = useState<GuestData>(initialData);
  const [cities, setCities] = useState<any[]>([]);
  const [isLoadingCities, setIsLoadingCities] = useState(false);
  const [citySearch, setCitySearch] = useState('');

  useEffect(() => {
    const fetchCities = async () => {
      if (!sessionToken) return;
      setIsLoadingCities(true);
      try {
        const cityList = await getGradovi(sessionToken);
        const sanitized = cityList.filter(c => !!c.name);
        
        // Sort alphabetically
        sanitized.sort((a, b) => a.name.localeCompare(b.name));
        setCities(sanitized);
      } catch (e) {
        console.error("Failed to load cities", e);
      } finally {
        setIsLoadingCities(false);
      }
    };
    fetchCities();
  }, [sessionToken]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setData(prev => ({ ...prev, [name]: value }));
  };

  const handleCitySelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const cityName = e.target.value;
    if (cityName) {
      setData(prev => ({ ...prev, placeOfBirth: cityName }));
    }
  };

  const filteredCities = useMemo(() => {
    if (!citySearch) return cities;
    const lower = citySearch.toLowerCase();
    return cities.filter(c => c.name.toLowerCase().includes(lower));
  }, [cities, citySearch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(data);
  };

  const inputClass = "w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm dark:text-slate-100";
  const labelClass = "block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Review Guest</h2>
          {data.rawMrz && (
            <div className="flex items-center space-x-1.5 text-emerald-600 dark:text-emerald-400 mt-0.5">
              <i className="fas fa-shield-check text-xs"></i>
              <span className="text-[10px] font-bold uppercase tracking-tight">MRZ Verified Data</span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-semibold"
        >
          Retake
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-4">
        <div className="md:col-span-1">
          <label className={labelClass}>First Name</label>
          <input name="firstName" value={data.firstName} onChange={handleChange} className={inputClass} required />
        </div>
        <div className="md:col-span-1">
          <label className={labelClass}>Last Name</label>
          <input name="lastName" value={data.lastName} onChange={handleChange} className={inputClass} required />
        </div>
        <div>
          <label className={labelClass}>Date of Birth</label>
          <input type="date" name="dateOfBirth" value={data.dateOfBirth} onChange={handleChange} className={inputClass} required />
        </div>
        <div>
          <label className={labelClass}>Gender</label>
          <select name="gender" value={data.gender} onChange={handleChange} className={inputClass}>
            {Object.values(Gender).map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        
        {/* Place of Birth Section */}
        <div className="md:col-span-2 space-y-3">
          <div>
            <label className={labelClass}>Place of Birth</label>
            <input 
              name="placeOfBirth" 
              value={data.placeOfBirth} 
              onChange={handleChange} 
              className={inputClass} 
              placeholder="Enter or select city below"
              required 
            />
          </div>
          
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="flex items-center space-x-2">
                <div className="bg-indigo-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded">RGZ</div>
                <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Official City Registry</label>
              </div>
              {isLoadingCities ? (
                <div className="flex items-center space-x-2 text-indigo-500 dark:text-indigo-400 animate-pulse">
                   <i className="fas fa-circle-notch fa-spin text-xs"></i>
                   <span className="text-[9px] font-bold uppercase">Fetching...</span>
                </div>
              ) : (
                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500">{cities.length} available</span>
              )}
            </div>

            <div className="space-y-2">
              <div className="relative">
                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-600 text-[10px]"></i>
                <input 
                  type="text"
                  placeholder="Filter cities..."
                  className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none focus:ring-1 focus:ring-indigo-400 dark:text-slate-100"
                  value={citySearch}
                  onChange={(e) => setCitySearch(e.target.value)}
                />
              </div>

              <select 
                onChange={handleCitySelect} 
                className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none focus:ring-1 focus:ring-indigo-400 dark:text-slate-100"
                disabled={isLoadingCities || cities.length === 0}
                value={cities.find(c => c.name === data.placeOfBirth) ? data.placeOfBirth : ""}
              >
                <option value="">{isLoadingCities ? "Loading official list..." : (cities.length === 0 ? "No cities found" : "-- Select from official list --")}</option>
                {filteredCities.map(city => (
                  <option key={city.id} value={city.name}>
                    {city.name}
                  </option>
                ))}
              </select>
            </div>
            
            {cities.length === 0 && !isLoadingCities && (
              <p className="text-[9px] text-amber-600 font-bold mt-2 px-1">
                <i className="fas fa-info-circle mr-1"></i> Registry unavailable. Please enter manually.
              </p>
            )}
          </div>
        </div>

        <div>
          <label className={labelClass}>State/Country of Birth</label>
          <input name="countryOfBirth" value={data.countryOfBirth} onChange={handleChange} className={inputClass} placeholder="Country" />
        </div>
        <div>
          <label className={labelClass}>Nationality</label>
          <input name="nationality" value={data.nationality} onChange={handleChange} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Document Number</label>
          <input name="documentNumber" value={data.documentNumber} onChange={handleChange} className={`${inputClass} font-mono font-bold text-indigo-700 dark:text-indigo-400`} required />
        </div>
      </div>

      {data.rawMrz && (
        <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-700">
          <label className={labelClass}>Detected MRZ String</label>
          <div className="font-mono text-[10px] break-all text-slate-600 dark:text-slate-400 leading-tight">
            {data.rawMrz}
          </div>
        </div>
      )}

      <hr className="border-slate-100 dark:border-slate-800" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Arrival Date</label>
          <input type="date" name="arrivalDate" value={data.arrivalDate} onChange={handleChange} className={inputClass} required />
        </div>
        <div>
          <label className={labelClass}>Document Expiry</label>
          <input type="date" name="expiryDate" value={data.expiryDate} onChange={handleChange} className={inputClass} />
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
            <span>Processing...</span>
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
