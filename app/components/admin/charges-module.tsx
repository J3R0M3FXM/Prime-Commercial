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
  const [isActive, setIsActive] = useState(true);
  
  // Schedules State
  const [scheduleTemporal, setScheduleTemporal] = useState(false);
  const [scheduleOvernight, setScheduleOvernight] = useState(false);
  const [scheduleRecurring, setScheduleRecurring] = useState(false);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);

  const toggleDay = (day: number) => {
    setDaysOfWeek(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
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
    setIsActive(true);
    setScheduleTemporal(false);
    setScheduleOvernight(false);
    setScheduleRecurring(false);
    setDaysOfWeek([]);
    setEditingCharge(null);
  };

  const handleEdit = (charge: any) => {
    setEditingCharge(charge);
    setName(charge.name);
    setType(charge.type || 'fixed');
    setAmount(charge.amount || 0);
    setIsActive(charge.isActive ?? true);
    setScheduleTemporal(charge.schedules?.temporal || false);
    setScheduleOvernight(charge.schedules?.overnight || false);
    setScheduleRecurring(charge.schedules?.recurring || false);
    setDaysOfWeek(charge.schedules?.daysOfWeek || []);
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
        isActive,
        schedules: {
          temporal: scheduleTemporal,
          overnight: scheduleOvernight,
          recurring: scheduleRecurring,
          daysOfWeek
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
                  <span className="text-slate-400">Status:</span>
                  <span className={`font-bold ${charge.isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {charge.isActive ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </div>
                
                <div className="pt-2">
                  <span className="text-slate-400 text-[10px] uppercase tracking-wider block mb-2">Active Schedules</span>
                  <div className="flex flex-wrap gap-2">
                    {charge.schedules?.temporal && <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded font-bold text-[9px] uppercase tracking-wider">Temporal</span>}
                    {charge.schedules?.overnight && <span className="bg-indigo-50 text-indigo-600 px-2 py-1 rounded font-bold text-[9px] uppercase tracking-wider">Overnight</span>}
                    {charge.schedules?.recurring && <span className="bg-orange-50 text-orange-600 px-2 py-1 rounded font-bold text-[9px] uppercase tracking-wider">Recurring</span>}
                    {!charge.schedules?.temporal && !charge.schedules?.overnight && !charge.schedules?.recurring && (
                       <span className="text-slate-400 text-[10px] italic">None specified</span>
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
                      <span className="block text-sm font-bold text-slate-900">Active Status</span>
                      <span className="block text-xs text-slate-500">Enable this charge to be available for calculations</span>
                    </div>
                    <div className="relative inline-flex items-center h-6 rounded-full w-11 shrink-0">
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={e => setIsActive(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100">
                <h4 className="font-heading font-black text-sm uppercase tracking-wider text-slate-800 mb-4 flex items-center gap-2">
                  <Settings className="w-4 h-4" /> Schedules
                </h4>

                {(scheduleTemporal || scheduleRecurring) && (
                  <div className="mb-4">
                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Apply on Days</label>
                    <div className="flex gap-1">
                      {['S','M','T','W','T','F','S'].map((day, i) => (
                        <button type="button" key={i} onClick={() => toggleDay(i)} className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${daysOfWeek.includes(i) ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={scheduleTemporal}
                      onChange={e => setScheduleTemporal(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                    />
                    <span className="text-sm font-medium text-slate-700">Temporal</span>
                  </label>
                  
                  <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={scheduleOvernight}
                      onChange={e => setScheduleOvernight(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                    />
                    <span className="text-sm font-medium text-slate-700">Overnight</span>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={scheduleRecurring}
                      onChange={e => setScheduleRecurring(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                    />
                    <span className="text-sm font-medium text-slate-700">Recurring</span>
                  </label>
                </div>
              </div>
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
