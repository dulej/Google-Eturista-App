
import React, { useState } from 'react';

interface LoginScreenProps {
  onLogin: (user: string, pass: string, env: 'test' | 'prod') => Promise<boolean>;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('Dusan.jovanovic.nis.95@gmail.com');
  const [env, setEnv] = useState<'test' | 'prod'>(() => 
    (localStorage.getItem('eturista_env') as 'test' | 'prod') || 'test'
  );
  const [password, setPassword] = useState(env === 'prod' ? '$-Fj2M6N' : 'fk8k?9wW');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEnvChange = (newEnv: 'test' | 'prod') => {
    setEnv(newEnv);
    localStorage.setItem('eturista_env', newEnv);
    if (newEnv === 'prod') {
      setPassword('$-Fj2M6N');
    } else {
      setPassword('fk8k?9wW');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const success = await onLogin(username, password, env);
      if (!success) {
        setError('Neispravno korisničko ime ili lozinka.');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.message === 'INVALID_CREDENTIALS') {
        setError('Pogrešno korisničko ime ili lozinka.');
      } else {
        setError(`Greška na serveru: ${err.message || 'Proverite internet vezu'}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center">
        <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/40 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 mx-auto mb-4">
          <i className="fas fa-lock text-2xl"></i>
        </div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Prijava na sistem</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Unesite vaše eTurista portal kredencijale.</p>
      </div>

      <div className="bg-slate-50 dark:bg-slate-800/50 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 flex">
        <button
          type="button"
          onClick={() => handleEnvChange('test')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${env === 'test' ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}`}
        >
          Test okruženje
        </button>
        <button
          type="button"
          onClick={() => handleEnvChange('prod')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${env === 'prod' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none' : 'text-slate-500'}`}
        >
          Produkcija
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Korisničko ime</label>
          <div className="relative">
            <i className="fas fa-user absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 text-sm"></i>
            <input 
              type="text" 
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm dark:text-slate-100 dark:placeholder-slate-500"
              placeholder="Korisničko ime"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Lozinka</label>
          <div className="relative">
            <i className="fas fa-key absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 text-sm"></i>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm dark:text-slate-100 dark:placeholder-slate-500"
              placeholder="••••••••"
            />
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs font-medium rounded-xl border border-red-100 dark:border-red-900/30 animate-in fade-in flex items-start space-x-2">
            <i className="fas fa-circle-exclamation mt-0.5"></i>
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 transition-all flex items-center justify-center space-x-2 disabled:opacity-70 disabled:cursor-not-allowed mt-4"
        >
          {isLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-right-to-bracket"></i>}
          <span>{isLoading ? 'Povezivanje...' : 'Prijavi se'}</span>
        </button>
      </form>
    </div>
  );
};

export default LoginScreen;
