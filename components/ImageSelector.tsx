
import React, { useRef, useState } from 'react';

interface ImageSelectorProps {
  onImagesReady: (images: string[]) => void;
  onBack: () => void;
}

const ImageSlot: React.FC<{
  label: string;
  image: string | null;
  onSelect: (base64: string) => void;
  icon: string;
}> = ({ label, image, onSelect, icon }) => {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => onSelect(reader.result as string);
      reader.readAsDataURL(file);
    }
    // Reset value so same file can be selected again if needed
    e.target.value = '';
  };

  return (
    <div className="flex flex-col space-y-3">
      <div className="flex items-center space-x-2 px-1">
        <i className={`${icon} text-indigo-500 dark:text-indigo-400 text-xs`}></i>
        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</span>
      </div>
      
      <div 
        className={`relative aspect-[3/2] rounded-2xl border-2 transition-all overflow-hidden flex flex-col items-center justify-center ${
          image ? 'border-indigo-500 dark:border-indigo-400 bg-white dark:bg-slate-800 shadow-md' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 border-dashed'
        }`}
      >
        {image ? (
          <>
            <img src={image} className="w-full h-full object-cover animate-in fade-in zoom-in duration-300" alt={label} />
            <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center space-x-3">
              <button 
                onClick={() => cameraInputRef.current?.click()}
                className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg flex items-center space-x-1"
              >
                <i className="fas fa-camera"></i>
                <span>Ponovo skeniraj</span>
              </button>
              <button 
                onClick={() => galleryInputRef.current?.click()}
                className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg flex items-center space-x-1"
              >
                <i className="fas fa-image"></i>
                <span>Galerija</span>
              </button>
            </div>
          </>
        ) : (
          <div className="p-6 w-full h-full flex flex-col items-center justify-center space-y-4">
            <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/40 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400">
               <i className={`${icon} text-xl`}></i>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-2 w-full max-w-[240px]">
              <button 
                onClick={() => cameraInputRef.current?.click()}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-3 rounded-xl text-xs font-bold shadow-sm flex items-center justify-center space-x-2 transition-all active:scale-95"
              >
                <i className="fas fa-camera"></i>
                <span>Skeniraj</span>
              </button>
              <button 
                onClick={() => galleryInputRef.current?.click()}
                className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500 text-slate-600 dark:text-slate-400 py-2 px-3 rounded-xl text-xs font-bold shadow-sm flex items-center justify-center space-x-2 transition-all active:scale-95"
              >
                <i className="fas fa-image"></i>
                <span>Galerija</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Hidden inputs for explicit control */}
      <input 
        type="file" 
        ref={cameraInputRef} 
        className="hidden" 
        accept="image/*" 
        capture="environment" 
        onChange={handleFileChange} 
      />
      <input 
        type="file" 
        ref={galleryInputRef} 
        className="hidden" 
        accept="image/*" 
        onChange={handleFileChange} 
      />
    </div>
  );
};

const ImageSelector: React.FC<ImageSelectorProps> = ({ onImagesReady, onBack }) => {
  const [documentImage, setDocumentImage] = useState<string | null>(null);

  const isComplete = !!documentImage;

  const handleFinish = () => {
    if (isComplete) {
      onImagesReady([documentImage!]);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
            <i className="fas fa-arrow-left text-xs"></i>
          </button>
          <div>
            <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 leading-tight">
              Skeniranje dokumenta
            </h2>
            <p className="text-slate-400 dark:text-slate-500 text-[10px] font-bold uppercase tracking-widest">Korak 2: Fotografisanje dokumenta</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 grid-cols-1">
        <ImageSlot 
          label="Pasoš ili Zadnja strana lične karte"
          image={documentImage}
          onSelect={setDocumentImage}
          icon="fas fa-id-card"
        />
      </div>

      <div className="space-y-4 pt-4">
        <button
          onClick={handleFinish}
          disabled={!isComplete}
          className={`w-full py-4 rounded-2xl font-bold transition-all flex items-center justify-center space-x-2 shadow-xl ${
            isComplete ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:-translate-y-0.5 active:translate-y-0' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
          }`}
        >
          <i className="fas fa-wand-magic-sparkles"></i>
          <span>Izvuci podatke pomoću AI</span>
        </button>
        
        <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-xl border border-amber-100 dark:border-amber-900/30 flex items-start space-x-3">
          <i className="fas fa-circle-exclamation text-amber-500 dark:text-amber-400 mt-0.5"></i>
          <p className="text-[10px] text-amber-800 dark:text-amber-200 leading-normal font-medium">
            Uverite se da su detalji dokumenta čitljivi i da nema odsjaja. Za lične karte, <strong>Machine Readable Zone (MRZ)</strong> se nalazi na poleđini.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ImageSelector;
