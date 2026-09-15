'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Settings, Receipt, Loader2, X, Check, Trash2, Edit2, Info } from 'lucide-react';

export default function ChargesModule() {
  const [charges, setCharges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editingCharge, setEditingCharge] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [type, setType] = useState<'fixed' | 'percentage'>('fixed');
  const [amount, setAmount] = useState<number>(0);
  const [isDefault, setIsDefault] = useState(true); // Default Add to Bill
  
  // Schedules State
  const [scheduleDate, setScheduleDate] = useState(''); // Date
  const [scheduleDay, setScheduleDay] = useState<number[]>([]); // Days 0-6
  const [scheduleTime, setScheduleTime] = useState(''); // Time
  const [isOvernight, setIsOvernight] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);

  const toggleDay = (day: number) => {
    setScheduleDay(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const fetchCharges = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/charges');
      const data = await res.json();
      setCharges(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCharges();
  }, []);

  const resetForm = () => {
    setName('');
    setType('fixed');
    setAmount(0);
    setIsDefault(true);
    setScheduleDate('');
    setScheduleDay([]);
    setScheduleTime('');
    setIsOvernight(false);
    setIsRecurring(false);
    setEditingCharge(null);
  };

  const handleEdit = (charge: any) => {
    setEditingCharge(charge);
    setName(charge.name);
    setType(charge.type || 'fixed');
    setAmount(charge.amount || 0);
    setIsDefault(charge.isDefault ?? true);
    setScheduleDate(charge.schedules?.date || '');
    setScheduleDay(charge.schedules?.days || []);
    setScheduleTime(charge.schedules?.time || '');
    setIsOvernight(charge.schedules?.isOvernight || false);
    setIsRecurring(charge.schedules?.isRecurring || false);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this charge?')) return;
    try {
      await fetch(`/api/admin/charges?id=${id}`, { method: 'DELETE' });
      fetchCharges();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      alert("Name is required");
      return;
    }
    
    setIsSaving(true);
    try {
      const payload = {
        name: name.trim(),
        type,
        amount: Number(amount) || 0,
        isDefault,
        schedules: {
          date: scheduleDate,
          days: scheduleDay,
          time: scheduleTime,
          isOvernight,
          isRecurring
        }
      };

      const method = editingCharge ? "PUT" : "POST";
      if (editingCharge) (payload as any).id = editingCharge.id;

      await fetch("/api/admin/charges", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      await fetchCharges();
      setShowModal(false);
      resetForm();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-heading font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-emerald-600" />
            Charges Configuration
          </h2>
          <p className="text-xs font-mono text-slate-500 mt-1">Manage global additional charges and surcharges.</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Charge
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
        </div>
      ) : charges.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
          <Receipt className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h4 className="text-slate-900 font-bold mb-2">No Charges Configured</h4>
          <p className="text-slate-500 text-sm max-w-sm mx-auto">
            You have not configured any additional charges yet. Add your first charge to begin.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {charges.map(charge => (
            <div key={charge.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm relative group overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-heading font-black text-base text-slate-900 uppercase">
                      {charge.name}
                    </h4>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-600">
                      {charge.type === 'percentage' ? 'Percentage' : 'Fixed Amount'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 text-xs font-mono text-slate-600 mb-6 flex-1">
                <div className="flex justify-between items-center py-1 border-b border-slate-100">
                  <span className="text-slate-400">Value:</span>
                  <span className="font-bold text-slate-900 text-sm">
                    {charge.type === 'percentage' ? `${charge.amount}%` : `₱${charge.amount}`}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-100">
                  <span className="text-slate-400">Application:</span>
                  <span className={`font-bold uppercase text-[11px] px-2 py-0.5 rounded ${
                    (charge.isDefault ?? charge.isActive) ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {(charge.isDefault ?? (!charge.schedules?.overnight && !charge.schedules?.isOvernight && !charge.schedules?.days?.length && !charge.schedules?.date)) ? 'Default to Bill' : 'Scheduled Rule'}
                  </span>
                </div>
                
                <div className="pt-2">
                  <span className="text-slate-400 text-[10px] uppercase tracking-wider block mb-2">Schedule Details</span>
                  <div className="flex flex-wrap gap-1.5">
                    {Boolean(charge.schedules?.isOvernight || charge.schedules?.overnight) && (
                      <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-bold text-[9px] uppercase tracking-wider">
                        Overnight (10pm-6am)
                      </span>
                    )}
                    {Boolean(charge.schedules?.isRecurring || charge.schedules?.recurring) && (
                      <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded font-bold text-[9px] uppercase tracking-wider">
                        Recurring
                      </span>
                    )}
                    {charge.schedules?.date && (
                      <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-bold text-[9px] uppercase tracking-wider">
                        Date: {charge.schedules.date}
                      </span>
                    )}
                    {charge.schedules?.time && (
                      <span className="bg-cyan-50 text-cyan-700 px-2 py-0.5 rounded font-bold text-[9px] uppercase tracking-wider">
                        Time: {charge.schedules.time}
                      </span>
                    )}
                    {Array.isArray(charge.schedules?.days) && charge.schedules.days.length > 0 && (
                      <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded font-bold text-[9px] uppercase tracking-wider">
                        Days: {charge.schedules.days.map((d: number) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(', ')}
                      </span>
                    )}
                    {!(charge.schedules?.isOvernight || charge.schedules?.overnight) &&
                     !(charge.schedules?.isRecurring || charge.schedules?.recurring) &&
                     !charge.schedules?.date &&
                     !charge.schedules?.time &&
                     (!charge.schedules?.days || charge.schedules.days.length === 0) && (
                      <span className="text-slate-400 text-[10px] italic">Always active</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-4 border-t border-slate-100 mt-auto">
                <button
                  onClick={() => handleEdit(charge)}
                  className="flex-1 text-[11px] font-bold uppercase tracking-wider text-slate-600 hover:text-emerald-600 transition-colors bg-slate-100 hover:bg-emerald-50 py-2 rounded-md flex justify-center items-center gap-1.5"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Edit
                </button>
                <button
                  onClick={() => handleDelete(charge.id)}
                  className="flex-1 text-[11px] font-bold uppercase tracking-wider text-red-500 hover:text-red-700 transition-colors bg-red-50 hover:bg-red-100 py-2 rounded-md flex justify-center items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Charge Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-heading font-black text-lg uppercase tracking-wide text-slate-900">
                {editingCharge ? "Edit Charge" : "New Charge"}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">Charge Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Service Charge, Tax, Night Fee"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">Value Type</label>
                    <select
                      value={type}
                      onChange={e => setType(e.target.value as 'fixed' | 'percentage')}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    >
                      <option value="fixed">Fixed Amount</option>
                      <option value="percentage">Percentage (%)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">Amount</label>
                    <input
                      type="number"
                      value={amount}
                      onChange={e => setAmount(e.target.valueAsNumber || 0)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <label className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                    <div>
                      <span className="block text-sm font-bold text-slate-900">Default to Bill</span>
                      <span className="block text-xs text-slate-500">Automatically apply this charge to all orders</span>
                    </div>
                    <div className="relative inline-flex items-center h-6 rounded-full w-11 shrink-0">
                      <input
                        type="checkbox"
                        checked={isDefault}
                        onChange={e => setIsDefault(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                    </div>
                  </label>
                </div>
              </div>

              {!isDefault && (
                <div className="pt-6 border-t border-slate-100">
                  <h4 className="font-heading font-black text-sm uppercase tracking-wider text-slate-800 mb-4 flex items-center gap-2">
                    <Settings className="w-4 h-4" /> Schedule Configuration
                  </h4>
                  
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">Date</label>
                        <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">Time</label>
                        <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Apply on Days</label>
                      <div className="flex gap-1">
                        {['S','M','T','W','T','F','S'].map((day, i) => (
                          <button type="button" key={i} onClick={() => toggleDay(i)} className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${scheduleDay.includes(i) ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                            {day}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <input type="checkbox" checked={isOvernight} onChange={e => setIsOvernight(e.target.checked)} /> Overnight
                      </label>
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} /> Recurring
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-5 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !name.trim()}
                className="px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Charge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
