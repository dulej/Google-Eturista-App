
import React, { useState } from 'react';
import { PlanType } from '../types';

interface BillingScreenProps {
  currentCredits: number;
  currentPlan: PlanType;
  onPurchase: (type: 'CREDITS' | 'PLAN', value: number | PlanType) => void;
  onBack: () => void;
}

const BillingScreen: React.FC<BillingScreenProps> = ({ currentCredits, currentPlan, onPurchase, onBack }) => {
  const [checkoutItem, setCheckoutItem] = useState<{name: string, price: string, type: 'CREDITS' | 'PLAN', value: any} | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cardDetails, setCardDetails] = useState({ number: '', expiry: '', cvv: '', name: '' });

  const plans = [
    {
      id: 'STARTER' as PlanType,
      name: 'Starter',
      price: 'Free',
      subtitle: 'Pay as you go',
      features: ['5 Trial Credits', 'Manual PDF Entry', 'Email Support'],
      isCurrent: currentPlan === 'STARTER'
    },
    {
      id: 'PRO' as PlanType,
      name: 'Professional',
      price: '€29',
      subtitle: 'Unlimited Credits',
      features: ['Unlimited Guest Scans', 'Per Property License', 'Digital Signatures', 'eTurista Sync'],
      isPopular: true,
      isCurrent: currentPlan === 'PRO'
    }
  ];

  const creditPacks = [
    { name: 'Basic Pack', credits: 20, price: '€9.99' },
    { name: 'Business Pack', credits: 100, price: '€39.99' }
  ];

  const handlePayment = (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    // Simulate API call to Stripe/Payment Gateway
    setTimeout(() => {
      setIsProcessing(false);
      if (checkoutItem) {
        onPurchase(checkoutItem.type, checkoutItem.value);
        setCheckoutItem(null);
      }
    }, 2000);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center">
        <h2 className="text-3xl font-black text-slate-800 dark:text-slate-100">Billing & Plans</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-2">
          Current Plan: <span className="font-bold text-indigo-600 dark:text-indigo-400">{currentPlan}</span>
          {!checkoutItem && <span className="mx-2">•</span>}
          {!checkoutItem && <span className="text-slate-400 dark:text-slate-500">{currentPlan === 'STARTER' ? `${currentCredits} Credits Left` : 'Unlimited Usage'}</span>}
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 px-2">Subscriptions</h3>
        {plans.map((plan) => (
          <div 
            key={plan.id}
            className={`relative p-6 rounded-[2rem] border-2 transition-all ${
              plan.isCurrent ? 'border-emerald-500 bg-emerald-50/20 dark:bg-emerald-900/10' : plan.isPopular ? 'border-indigo-600 bg-indigo-50/30 dark:bg-indigo-900/10' : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800'
            }`}
          >
            {plan.isPopular && !plan.isCurrent && (
              <span className="absolute -top-3 right-8 bg-indigo-600 text-white text-[10px] font-black uppercase px-3 py-1 rounded-full shadow-lg">Recommended</span>
            )}
            {plan.isCurrent && (
              <span className="absolute -top-3 right-8 bg-emerald-600 text-white text-[10px] font-black uppercase px-3 py-1 rounded-full shadow-lg">Active Plan</span>
            )}
            
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{plan.name}</h3>
                <p className="text-xs text-indigo-600 dark:text-indigo-400 font-bold">{plan.subtitle}</p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-slate-900 dark:text-white">{plan.price}</span>
                {plan.id !== 'STARTER' && <span className="text-xs text-slate-400 ml-1">/mo</span>}
              </div>
            </div>

            <ul className="space-y-2 mb-6">
              {plan.features.map(f => (
                <li key={f} className="flex items-center text-xs text-slate-600 dark:text-slate-400">
                  <i className="fas fa-check-circle text-indigo-500 mr-2 text-[10px]"></i>
                  {f}
                </li>
              ))}
            </ul>

            <button
              disabled={plan.isCurrent}
              onClick={() => setCheckoutItem({ name: plan.name, price: plan.price, type: 'PLAN', value: plan.id })}
              className={`w-full py-3 rounded-2xl font-bold text-sm transition-all ${
                plan.isCurrent ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 cursor-default' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg active:scale-95'
              }`}
            >
              {plan.isCurrent ? 'Current Subscription' : `Upgrade to ${plan.name}`}
            </button>
          </div>
        ))}

        <div className="pt-4 space-y-4">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 px-2">One-time Credit Packs</h3>
          <div className="grid grid-cols-2 gap-4">
            {creditPacks.map(pack => (
              <button
                key={pack.name}
                onClick={() => setCheckoutItem({ name: `${pack.credits} Credits`, price: pack.price, type: 'CREDITS', value: pack.credits })}
                className="bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 p-5 rounded-3xl text-left hover:border-indigo-400 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/20 transition-all group shadow-sm"
              >
                <div className="text-indigo-600 dark:text-indigo-400 font-black text-xl mb-1">+{pack.credits}</div>
                <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-3 leading-tight">{pack.name}</div>
                <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{pack.price}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <button onClick={onBack} className="w-full py-2 text-slate-400 font-bold hover:text-slate-600 transition-colors text-xs uppercase tracking-widest">
        <i className="fas fa-arrow-left mr-2"></i> Return to Dashboard
      </button>

      {/* Payment Modal */}
      {checkoutItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-300">
            <div className="bg-indigo-600 p-8 text-white relative">
              <button onClick={() => setCheckoutItem(null)} className="absolute top-6 right-6 text-white/60 hover:text-white"><i className="fas fa-times"></i></button>
              <h3 className="text-2xl font-black mb-1">Checkout</h3>
              <p className="text-indigo-100 text-sm">Secure Payment for <strong>{checkoutItem.name}</strong></p>
              <div className="mt-6 flex items-baseline">
                <span className="text-4xl font-black">{checkoutItem.price}</span>
                <span className="ml-2 text-indigo-200 text-sm">{checkoutItem.type === 'PLAN' ? 'Subscription' : 'One-time'}</span>
              </div>
            </div>

            <form onSubmit={handlePayment} className="p-8 space-y-5">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 ml-1">Cardholder Name</label>
                <input 
                  required
                  placeholder="e.g. Dusan Jovanovic"
                  className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none dark:text-slate-100"
                  value={cardDetails.name}
                  onChange={e => setCardDetails({...cardDetails, name: e.target.value})}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 ml-1">Card Number</label>
                <div className="relative">
                  <input 
                    required
                    maxLength={19}
                    placeholder="xxxx xxxx xxxx xxxx"
                    className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono dark:text-slate-100"
                    value={cardDetails.number}
                    onChange={e => setCardDetails({...cardDetails, number: e.target.value.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim()})}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex space-x-1 opacity-40">
                    <i className="fab fa-cc-visa"></i>
                    <i className="fab fa-cc-mastercard"></i>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 ml-1">Expiry Date</label>
                  <input 
                    required
                    placeholder="MM / YY"
                    className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none dark:text-slate-100"
                    value={cardDetails.expiry}
                    onChange={e => setCardDetails({...cardDetails, expiry: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 ml-1">CVV</label>
                  <input 
                    required
                    type="password"
                    maxLength={3}
                    placeholder="•••"
                    className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none dark:text-slate-100"
                    value={cardDetails.cvv}
                    onChange={e => setCardDetails({...cardDetails, cvv: e.target.value})}
                  />
                </div>
              </div>

              <button 
                type="submit"
                disabled={isProcessing}
                className="w-full py-4 bg-slate-900 dark:bg-indigo-600 text-white font-black rounded-2xl shadow-xl hover:bg-black dark:hover:bg-indigo-700 transition-all flex items-center justify-center space-x-3 mt-4 disabled:opacity-50"
              >
                {isProcessing ? (
                  <i className="fas fa-circle-notch fa-spin"></i>
                ) : (
                  <i className="fas fa-shield-alt text-emerald-400"></i>
                )}
                <span>{isProcessing ? 'Authorizing Card...' : `Pay ${checkoutItem.price}`}</span>
              </button>
              
              <div className="flex items-center justify-center space-x-2 text-slate-400 dark:text-slate-500 text-[9px] uppercase font-black">
                <i className="fas fa-lock"></i>
                <span>SSL Encrypted Transaction</span>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillingScreen;
