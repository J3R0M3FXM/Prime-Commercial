"use client";
import { useEffect, useState } from 'react';
import { Plus, Save, Trash2, Power, MessageSquare, GripVertical } from 'lucide-react';

type Button = { id: string; text: string; response: string; url?: string };
type Chat = { business_connection_id: string; chat_id: number; last_customer_message_at?: string | null; last_human_message_at?: string | null; last_bot_message_at?: string | null; human_takeover_until?: string | null; bot_paused?: boolean };
type Flow = { id: string; name: string; active: boolean; triggerType: 'message'|'callback'; triggerValue: string; matchMode: 'exact'|'contains'|'starts_with'; responseText: string; buttons: Button[]; priority: number };

const emptyFlow = (): Flow => ({ id: '', name: 'New Automation', active: true, triggerType: 'message', triggerValue: '', matchMode: 'contains', responseText: '', buttons: [], priority: 100 });

export default function AutomationModule() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [settings, setSettings] = useState({ enabled: false, fallbackEnabled: false, fallbackResponse: '', welcomeFlowId: '', businessConnectionId: '', businessUserId: '', businessUserChatId: '' });
  const [selected, setSelected] = useState<Flow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/admin/automation', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load automation.');
    setFlows(data.flows || []); setChats(data.chats || []); setSettings(data.settings || settings);
    setLoading(false);
  };
  useEffect(() => { void load().catch(e => { setMessage(e.message); setLoading(false); }); }, []);

  const saveSettings = async () => {
    setSaving(true); setMessage('');
    try {
      const res = await fetch('/api/admin/automation', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'settings', ...settings }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      setSettings(data); setMessage('Automation settings saved.');
    } catch (e: any) { setMessage(e.message || 'Save failed.'); } finally { setSaving(false); }
  };

  const toggleChat = async (chat: Chat) => {
    const paused = !chat.bot_paused;
    const res = await fetch('/api/admin/automation', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'chat_pause', businessConnectionId: chat.business_connection_id, chatId: chat.chat_id, paused }) });
    const data = await res.json();
    if (!res.ok) { setMessage(data.error || 'Failed to update chat.'); return; }
    setChats(current => current.map(item => item.business_connection_id === chat.business_connection_id && item.chat_id === chat.chat_id ? { ...item, bot_paused: paused, updated_at: data.updated_at } : item));
    setMessage(paused ? 'Automation paused for this chat.' : 'Automation resumed for this chat.');
  };

  const saveFlow = async () => {
    if (!selected?.name.trim() || !selected.triggerValue.trim() || !selected.responseText.trim()) { setMessage('Name, trigger and response are required.'); return; }
    setSaving(true); setMessage('');
    try {
      const method = selected.id ? 'PUT' : 'POST';
      const res = await fetch('/api/admin/automation', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(selected) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      setFlows(current => selected.id ? current.map(f => f.id === data.id ? data : f) : [...current, data]);
      setSelected(data); setMessage('Automation saved.');
    } catch (e: any) { setMessage(e.message || 'Save failed.'); } finally { setSaving(false); }
  };

  const removeFlow = async (id: string) => {
    if (!confirm('Delete this automation?')) return;
    const res = await fetch('/api/admin/automation?id=' + encodeURIComponent(id), { method: 'DELETE' });
    if (!res.ok) { const data = await res.json(); setMessage(data.error || 'Delete failed.'); return; }
    setFlows(current => current.filter(f => f.id !== id)); if (selected?.id === id) setSelected(null);
  };

  const updateButton = (index: number, patch: Partial<Button>) => setSelected(current => current ? { ...current, buttons: current.buttons.map((b, i) => i === index ? { ...b, ...patch } : b) } : current);
  const addButton = () => setSelected(current => current ? { ...current, buttons: [...current.buttons, { id: 'btn_' + Date.now(), text: 'New Button', response: '' }] } : current);
  const deleteButton = (index: number) => setSelected(current => current ? { ...current, buttons: current.buttons.filter((_, i) => i !== index) } : current);

  return <div className="space-y-3">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div><p className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Telegram Business Secretary</p><h1 className="text-2xl font-heading font-black uppercase tracking-tight text-slate-900">Automation</h1><p className="text-xs text-slate-500 mt-1">Configure automatic replies and inline-button conversations for your connected Business account.</p></div>
      <button onClick={() => setSelected(emptyFlow())} className="h-10 px-3 rounded-none bg-slate-900 text-white text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"><Plus className="w-4 h-4"/> New Automation</button>
    </div>

    <div className="bg-white border border-slate-200 rounded-none p-2.5 sm:p-3 space-y-2.5"><div className="grid sm:grid-cols-3 gap-3"><ReadOnly label="Business User ID" value={settings.businessUserId}/><ReadOnly label="Business User Chat ID" value={settings.businessUserChatId}/><ReadOnly label="Business Connection ID" value={settings.businessConnectionId}/></div>
      <div className="flex items-center justify-between"><div><p className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Engine</p><h2 className="font-heading font-black uppercase">Business Automation</h2></div><button onClick={() => setSettings(s => ({ ...s, enabled: !s.enabled }))} className={`px-3 py-1.5 rounded-none text-[10px] font-bold uppercase ${settings.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}><Power className="inline w-3 h-3 mr-1"/>{settings.enabled ? 'Enabled' : 'Disabled'}</button></div>
      <label className="block text-[9px] font-bold uppercase tracking-widest text-slate-500">24-hour Welcome Automation</label><select value={settings.welcomeFlowId} onChange={e => setSettings(s => ({ ...s, welcomeFlowId: e.target.value }))} className="w-full h-9 rounded-none border border-slate-200 px-2 text-xs bg-white"><option value="">Select an automation</option>{flows.filter(f => f.active).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select><p className="text-[9px] text-slate-400">This response is sent on the first customer message, then again only after 24 hours of inactivity.</p><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={settings.fallbackEnabled} onChange={e => setSettings(s => ({ ...s, fallbackEnabled: e.target.checked }))}/> Use fallback response when no trigger matches</label>
      <textarea value={settings.fallbackResponse} onChange={e => setSettings(s => ({ ...s, fallbackResponse: e.target.value }))} placeholder="Fallback response..." className="w-full min-h-20 rounded-none border border-slate-200 p-3 text-sm outline-none focus:border-slate-900"/>
      <button disabled={saving} onClick={saveSettings} className="h-9 px-3 rounded-none bg-slate-900 text-white text-[10px] font-bold uppercase"><Save className="inline w-3 h-3 mr-1"/> Save Engine Settings</button>
    </div>

    {message && <div className="rounded-none border border-slate-200 bg-slate-50 p-3 text-xs font-mono text-slate-600">{message}</div>}

    <div className="bg-white border border-slate-200 rounded-none p-2.5 sm:p-3 space-y-3">
      <div><p className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Per-Chat Control</p><h2 className="font-heading font-black uppercase">Human Takeover / Pause</h2><p className="text-xs text-slate-500 mt-1">Pause automation for a specific customer when you want to handle the conversation manually. Paused chats stay silent until resumed.</p></div>
      {chats.length === 0 ? <p className="text-xs text-slate-400 py-2">No customer chats have reached the automation webhook yet.</p> : <div className="space-y-2">{chats.map(chat => <div key={chat.business_connection_id + ':' + chat.chat_id} className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-none border border-slate-100 bg-slate-50 p-3"><div className="flex-1 min-w-0"><p className="font-mono text-xs font-bold text-slate-800">Chat {chat.chat_id}</p><p className="text-[9px] text-slate-400 mt-1">Last customer: {chat.last_customer_message_at ? new Date(chat.last_customer_message_at).toLocaleString() : '—'}</p></div><span className={`text-[9px] font-bold uppercase px-2 py-1 rounded-none ${chat.bot_paused ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{chat.bot_paused ? 'Paused' : 'Active'}</span><button onClick={() => toggleChat(chat)} className="h-8 px-3 rounded-none border border-slate-200 bg-white text-[9px] font-bold uppercase">{chat.bot_paused ? 'Resume Bot' : 'Pause Bot'}</button></div>)}</div>}
    </div>

    <div className="grid lg:grid-cols-[280px_1fr] gap-2.5">
      <div className="bg-white border border-slate-200 rounded-none p-2">
        <div className="px-3 py-2 text-[9px] font-mono uppercase tracking-widest text-slate-400">Automations ({flows.length})</div>
        {loading ? <div className="p-2.5 text-xs text-slate-400">Loading...</div> : flows.length === 0 ? <div className="p-2.5 text-xs text-slate-400">No automations configured.</div> : flows.map(flow => <button key={flow.id} onClick={() => setSelected(flow)} className={`w-full text-left p-3 rounded-none border mb-1 ${selected?.id === flow.id ? 'border-slate-900 bg-slate-50' : 'border-transparent hover:bg-slate-50'}`}><div className="flex items-center gap-2"><MessageSquare className="w-4 h-4 text-slate-400"/><span className="font-bold text-xs truncate flex-1">{flow.name}</span><span className={`w-2 h-2 rounded-full ${flow.active ? 'bg-emerald-500' : 'bg-slate-300'}`}/></div><p className="text-[9px] text-slate-400 font-mono mt-1 truncate">{flow.triggerValue}</p></button>)}
      </div>

      <div className="bg-white border border-slate-200 rounded-none p-2.5 sm:p-3">
        {!selected ? <div className="min-h-80 flex items-center justify-center text-center text-slate-400"><div><MessageSquare className="w-8 h-8 mx-auto mb-2"/><p className="text-xs">Select an automation or create a new one.</p></div></div> : <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Automation Name" value={selected.name} onChange={v => setSelected({ ...selected, name: v })}/>
            <Field label="Trigger" value={selected.triggerValue} onChange={v => setSelected({ ...selected, triggerValue: v })}/>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <Select label="Trigger Type" value={selected.triggerType} options={[['message','Incoming message'],['callback','Callback data']]} onChange={v => setSelected({ ...selected, triggerType: v as any })}/>
            <Select label="Match" value={selected.matchMode} options={[['contains','Contains'],['exact','Exact'],['starts_with','Starts with']]} onChange={v => setSelected({ ...selected, matchMode: v as any })}/>
            <Field label="Priority" type="number" value={String(selected.priority)} onChange={v => setSelected({ ...selected, priority: Number(v) || 100 })}/>
          </div>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={selected.active} onChange={e => setSelected({ ...selected, active: e.target.checked })}/> Automation active</label>
          <div><label className="block text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-1">Response</label><textarea value={selected.responseText} onChange={e => setSelected({ ...selected, responseText: e.target.value })} placeholder="Use {{name}}, {{username}} or {{user_id}}" className="w-full min-h-28 rounded-none border border-slate-200 p-3 text-sm outline-none focus:border-slate-900"/></div>
          <div className="border-t border-slate-100 pt-2 space-y-3">
            <div className="flex items-center justify-between"><div><p className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Inline Keyboard</p><p className="text-xs text-slate-500">Each button can edit the current Telegram message with its configured response.</p></div><button onClick={addButton} className="h-8 px-3 rounded-none border border-slate-200 text-[9px] font-bold uppercase"><Plus className="inline w-3 h-3 mr-1"/> Add Button</button></div>
            {selected.buttons.map((button, index) => <div key={button.id} className="rounded-none border border-slate-200 bg-slate-50 p-3 space-y-2"><div className="flex gap-2 items-center"><GripVertical className="w-4 h-4 text-slate-300"/><input value={button.text} onChange={e => updateButton(index, { text: e.target.value })} placeholder="Button label" className="flex-1 h-9 rounded-none border border-slate-200 bg-white px-2 text-xs"/><button onClick={() => deleteButton(index)} className="p-2 text-red-500"><Trash2 className="w-4 h-4"/></button></div><input value={button.url || ''} onChange={e => updateButton(index, { url: e.target.value })} placeholder="Optional URL (leave blank for callback)" className="w-full h-9 rounded-none border border-slate-200 bg-white px-2 text-xs"/><textarea value={button.response} onChange={e => updateButton(index, { response: e.target.value })} placeholder="Response after button click" className="w-full min-h-20 rounded-none border border-slate-200 bg-white p-2 text-xs"/></div>)}
          </div>
          <div className="flex flex-wrap justify-between gap-2 pt-2"><div>{selected.id && <button onClick={() => removeFlow(selected.id)} className="h-9 px-3 rounded-none border border-red-200 text-red-600 text-[10px] font-bold uppercase"><Trash2 className="inline w-3 h-3 mr-1"/> Delete</button>}</div><button disabled={saving} onClick={saveFlow} className="h-9 px-3 rounded-none bg-slate-900 text-white text-[10px] font-bold uppercase"><Save className="inline w-3 h-3 mr-1"/> Save Automation</button></div>
        </div>}
      </div>
    </div>
  </div>;
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label className="block"><span className="block text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-1">{label}</span><input type={type} value={value} onChange={e => onChange(e.target.value)} className="w-full h-9 rounded-none border border-slate-200 px-2 text-xs outline-none focus:border-slate-900"/></label>; }
function Select({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) { return <label className="block"><span className="block text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-1">{label}</span><select value={value} onChange={e => onChange(e.target.value)} className="w-full h-9 rounded-none border border-slate-200 px-2 text-xs bg-white">{options.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>; }
function ReadOnly({ label, value }: { label: string; value: string }) { return <label className="block"><span className="block text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-1">{label}</span><input readOnly value={value || 'Not connected'} className="w-full h-9 rounded-none border border-slate-200 px-2 text-[10px] font-mono bg-slate-50 text-slate-600"/></label>; }
