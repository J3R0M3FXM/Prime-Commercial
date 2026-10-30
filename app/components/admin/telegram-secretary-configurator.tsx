"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ChevronRight, ImagePlus, Loader2, MessageSquare, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { AdminDisclosure, AdminSwitch } from "./admin-ui";
import { callServerless, uploadStaffImage } from "@/lib/telegram-serverless-client";
import TelegramMediaImage from "@/app/components/telegram-media-image";

type Action = "flow" | "reply" | "url";

type Button = {
  id: string;
  text: string;
  action: Action;
  response: string;
  url: string;
  targetFlowId: string;
};

type Flow = {
  id: string;
  name: string;
  active: boolean;
  triggerType: "message" | "callback";
  triggerValue: string;
  matchMode: "exact" | "contains" | "starts_with";
  responseText: string;
  mediaUrl: string;
  buttons: Button[];
  priority: number;
};

type Settings = {
  enabled: boolean;
  fallbackEnabled: boolean;
  fallbackResponse: string;
  welcomeFlowId: string;
  businessConnectionId: string;
  businessUserId: string;
  businessUserChatId: string;
};

const DEFAULT_SETTINGS: Settings = {
  enabled: false,
  fallbackEnabled: false,
  fallbackResponse: "",
  welcomeFlowId: "",
  businessConnectionId: "",
  businessUserId: "",
  businessUserChatId: "",
};

const FLOW_MEDIA_MARKER = "__secretary_step_media__";

function makeButton(index: number): Button {
  return {
    id: "b_" + Date.now().toString(36) + "_" + index,
    text: "New Button",
    action: "flow",
    response: "",
    url: "",
    targetFlowId: "",
  };
}

function makeFlow(): Flow {
  return {
    id: "",
    name: "New Secretary Step",
    active: true,
    triggerType: "message",
    triggerValue: "",
    matchMode: "contains",
    responseText: "Enter the message shown in this bubble.",
    mediaUrl: "",
    buttons: [],
    priority: 100,
  };
}

function normalizeButton(raw: any, index: number): Button {
  const action = raw?.url
    ? "url"
    : raw?.action === "flow"
      ? "flow"
      : "reply";

  return {
    id: String(raw?.id || makeButton(index).id),
    text: String(raw?.text || "Option"),
    action,
    response: String(raw?.response || ""),
    url: String(raw?.url || ""),
    targetFlowId: String(raw?.targetFlowId || ""),
  };
}

function normalizeFlow(raw: any): Flow {
  const rawButtons = Array.isArray(raw?.buttons) ? raw.buttons : [];
  const mediaMarker = rawButtons.find((button: any) => button?.id === FLOW_MEDIA_MARKER);
  return {
    id: String(raw?.id || ""),
    name: String(raw?.name || "Secretary Step"),
    active: raw?.active !== false,
    triggerType: raw?.triggerType === "callback" ? "callback" : "message",
    triggerValue: String(raw?.triggerValue || ""),
    matchMode: raw?.matchMode === "exact" || raw?.matchMode === "starts_with"
      ? raw.matchMode
      : "contains",
    responseText: String(raw?.responseText || ""),
    mediaUrl: String(raw?.mediaUrl || mediaMarker?.mediaUrl || ""),
    buttons: rawButtons.filter((button: any) => button?.id !== FLOW_MEDIA_MARKER)
      .map((button: any, index: number) => normalizeButton(button, index)),
    priority: Number(raw?.priority) || 100,
  };
}

function callbackBytes(flowId: string, buttonId: string) {
  return new TextEncoder().encode("sec:" + flowId + ":" + buttonId).length;
}

function normalizeChat(raw: any) {
  return {
    ...raw,
    business_connection_id: String(raw?.businessConnectionId ?? raw?.business_connection_id ?? ""),
    chat_id: raw?.chatId ?? raw?.chat_id,
    last_customer_message_at: raw?.lastCustomerMessageAt ?? raw?.last_customer_message_at,
    bot_paused: raw?.botPaused ?? raw?.bot_paused ?? false,
  };
}

export default function TelegramSecretaryConfigurator({ serverless = false, onBack }: { serverless?: boolean; onBack?: () => void }) {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [chats, setChats] = useState<any[]>([]);
  const [selected, setSelected] = useState<Flow | null>(null);
  const [expandedButton, setExpandedButton] = useState("");
  const [stepTab, setStepTab] = useState<"trigger" | "reply" | "buttons">("trigger");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [testMode, setTestMode] = useState(false);
  const [testChatId, setTestChatId] = useState("");
  const [monoMode, setMonoMode] = useState(false);

  async function requestAutomation(action: string, payload: Record<string, unknown> = {}, legacyRequest?: RequestInit, legacyUrl = "/api/admin/automation") {
    if (serverless) return await callServerless<any>("manageAutomation", { action, ...payload }, 20_000);
    const response = await fetch(legacyUrl, { cache: "no-store", ...legacyRequest });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || "Secretary request failed.");
    return data;
  }

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        setLoading(true);
        const data = await requestAutomation("list", {}, { method: "GET" });
        if (cancelled) return;

        const loaded = Array.isArray(data?.flows)
          ? data.flows.map((flow: any) => normalizeFlow(flow))
          : [];

        setFlows(loaded);
        setChats(Array.isArray(data?.chats) ? data.chats.map(normalizeChat) : []);
        setSettings({ ...DEFAULT_SETTINGS, ...(data?.settings || {}) });

      } catch (error: any) {
        if (!cancelled) setNotice(error?.message || "Failed to load configuration.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  function updateSelected(patch: Partial<Flow>) {
    setSelected((current) => (current ? { ...current, ...patch } : current));
  }

  function updateButton(index: number, patch: Partial<Button>) {
    setSelected((current) => {
      if (!current) return current;
      return {
        ...current,
        buttons: current.buttons.map((button, itemIndex) =>
          itemIndex === index ? { ...button, ...patch } : button,
        ),
      };
    });
  }

  function addButton() {
    setSelected((current) =>
      current
        ? { ...current, buttons: [...current.buttons, makeButton(current.buttons.length + 1)] }
        : current,
    );
  }

  function removeButton(index: number) {
    setSelected((current) =>
      current
        ? { ...current, buttons: current.buttons.filter((_, itemIndex) => itemIndex !== index) }
        : current,
    );
  }

  async function saveSettings() {
    setBusy(true);
    setNotice("");
    try {
      const data = await requestAutomation("settings", settings, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "settings", ...settings }),
      });
      setSettings({ ...DEFAULT_SETTINGS, ...data });
      setNotice("AUTO REPLY SETTINGS SAVED.");
    } catch (error: any) {
      setNotice(error?.message || "Failed to save settings.");
    } finally {
      setBusy(false);
    }
  }

  async function saveFlow() {
    if (!selected) return;

    const name = selected.name.trim();
    const responseText = selected.responseText.trim();

    if (!name || (!responseText && !selected.mediaUrl.trim())) {
      setNotice("ADD A STEP NAME AND EITHER A MESSAGE OR AN IMAGE.");
      return;
    }

    const invalidTarget = selected.buttons.find(
      (button) => button.action === "flow" && (!button.targetFlowId || button.targetFlowId === selected.id),
    );
    if (invalidTarget) {
      setNotice("SELECT A TARGET STEP FOR " + invalidTarget.text.toUpperCase() + ".");
      return;
    }

    const longCallback = selected.buttons.find(
      (button) => callbackBytes(selected.id || "new", button.id) > 64,
    );
    if (longCallback) {
      setNotice("CALLBACK DATA IS OVER 64 BYTES FOR " + longCallback.text.toUpperCase() + ".");
      return;
    }

    setBusy(true);
    setNotice("");

    try {
      const flowPayload = {
          ...selected,
          name,
          responseText,
          buttons: [
            ...selected.buttons.map((button) => ({
              ...button,
              text: String(button.text || "Option").trim().slice(0, 64),
              response: String(button.response || ""),
              url: String(button.url || "").trim(),
              targetFlowId: String(button.targetFlowId || "").trim(),
            })),
            ...(selected.mediaUrl.trim() ? [{ id: FLOW_MEDIA_MARKER, mediaUrl: selected.mediaUrl.trim() }] : []),
          ],
        };
      const data = await requestAutomation(selected.id ? "update" : "create", flowPayload, {
        method: selected.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(flowPayload),
      });

      const saved = normalizeFlow(data);
      setFlows((current) =>
        selected.id
          ? current.map((flow) => (flow.id === saved.id ? saved : flow))
          : [...current, saved],
      );
      setSelected(saved);
      setNotice("SECRETARY STEP SAVED.");
    } catch (error: any) {
      setNotice(error?.message || "Failed to save step.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteFlow() {
    if (!selected?.id) return;
    if (!window.confirm("DELETE SECRETARY STEP " + selected.name + "?")) return;

    setBusy(true);
    try {
      await requestAutomation("delete", { id: selected.id }, { method: "DELETE" }, "/api/admin/automation?id=" + encodeURIComponent(selected.id));

      setFlows((current) => current.filter((flow) => flow.id !== selected.id));
      setSelected(null);
      if (settings.welcomeFlowId === selected.id) setSettings((current) => ({ ...current, welcomeFlowId: "" }));
      setNotice("SECRETARY STEP DELETED.");
    } catch (error: any) {
      setNotice(error?.message || "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleChat(chat: any) {
    const paused = !Boolean(chat?.bot_paused);
    try {
      await requestAutomation("pauseChat", {
        businessConnectionId: chat.business_connection_id,
        chatId: chat.chat_id,
        paused,
      }, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "chat_pause", businessConnectionId: chat.business_connection_id, chatId: chat.chat_id, paused }),
      });

      setChats((current) =>
        current.map((item) =>
          item.business_connection_id === chat.business_connection_id &&
          item.chat_id === chat.chat_id
            ? { ...item, bot_paused: paused }
            : item,
        ),
      );
    } catch (error: any) {
      setNotice(error?.message || "Failed to update chat.");
    }
  }

  const parent = selected
    ? flows.find((flow) => flow.buttons.some((button) => button.targetFlowId === selected.id)) || null
    : null;
  const displayedFlows = selected && !selected.id ? [...flows, selected] : flows;

  return (
    <div className={`admin-feature-module secretary-configurator w-full min-w-0 space-y-3 text-slate-900${monoMode ? " is-mono" : ""}`}>
      <header className="secretary-configurator__header">
        <div className="min-w-0">
          {onBack && <button type="button" onClick={onBack} className="mb-2 border border-slate-300 bg-white px-3 py-2 text-xs font-bold uppercase text-slate-700">← Admin</button>}
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-slate-500">Telegram Business · {serverless ? "Serverless Secretary" : "Automation"}</div>
          <h1>Secretary Configurator</h1>
          <p>Set up automatic replies one step at a time. Open a section when you are ready to edit it; your changes only take effect after you save.</p>
        </div>
        <div className="secretary-header-actions">
          <button type="button" onClick={() => window.location.reload()}><RefreshCw className="w-4 h-4" /> Reload</button>
          <button type="button" onClick={() => { setSelected(makeFlow()); setExpandedButton(""); setStepTab("trigger"); setNotice(""); }}><Plus className="w-4 h-4" /> New step</button>
        </div>
      </header>

      <AdminDisclosure title="How the Secretary works" meta="Quick guide">
        <div className="secretary-help-card">
          <p><strong>1. Create a reply step.</strong> Give it a name, choose what customer message should trigger it, and write the reply.</p>
          <p><strong>2. Add buttons if needed.</strong> Buttons can open another step, change the current message, or open a link.</p>
          <p><strong>3. Preview and save.</strong> Check the message preview, then save each step. Automatic replies also require a connected Telegram Business account and the Secretary switch to be enabled.</p>
        </div>
      </AdminDisclosure>

      <section className="secretary-display-option" aria-label="Text display options">
        <div><strong>Message formatting</strong><span>Use fixed-width text when you need columns or aligned numbers in a reply.</span></div>
        <AdminSwitch checked={monoMode} onChange={setMonoMode} label="Mono font" description={monoMode ? "Monospaced text is on" : "Monospaced text is off"} />
      </section>

      {notice && <div role="status" className="border border-slate-200 bg-slate-50 px-2 py-2 text-[10px] font-mono uppercase break-words">{notice}</div>}
      {error && <div role="alert" className="border border-red-200 bg-red-50 px-2 py-2 text-[10px] text-red-800 break-words">{error}</div>}

      <section className={`secretary-status ${settings.businessConnectionId ? "is-connected" : "is-disconnected"}`} role="status">
        <span className="secretary-status__dot" />
        <p>{settings.businessConnectionId ? "Business account connected · reply permission active. Incoming messages receive a matching step or fallback." : "Telegram Business is not connected. Connect an account and grant reply permission to activate automatic replies."}</p>
        <button type="button" onClick={() => window.location.reload()}>Refresh status</button>
      </section>

      <AdminDisclosure title="Test mode" meta={testMode ? "On" : "Off"}>
        <section className="secretary-panel secretary-panel--inside">
        <p className="secretary-help">Choose a recent conversation to preview how a reply will look. Previewing does not send a message.</p>
        <label className="secretary-check-row"><input type="checkbox" checked={testMode} onChange={(event) => setTestMode(event.target.checked)} /><span>Preview replies for the selected account</span></label>
        <label className="block"><span className="label-mini">Test account · choose a recent customer chat</span><span className="secretary-help">Select a conversation that has already messaged the business. Previewing does not send to them.</span>
          <select value={testChatId} onChange={(event) => setTestChatId(event.target.value)} className="control-mini w-full"><option value="">Choose a recent chat</option>{chats.map((chat) => <option key={chat.business_connection_id + ":" + chat.chat_id} value={String(chat.chat_id)}>{chat.first_name || chat.username || "Customer"} · {chat.chat_id}</option>)}</select>
        </label>
        <p>Test mode previews the selected chat in the customer preview below. The normal 24-hour reply cooldown still applies.</p>
        </section>
      </AdminDisclosure>

      <AdminDisclosure title="Auto reply settings" meta={settings.enabled ? "Enabled" : "Disabled"}>
        <section className="secretary-panel secretary-panel--inside">
        <p className="secretary-help">These options control whether saved steps can reply automatically and what to say when no step matches.</p>
        <div className="secretary-panel__heading"><h2>Auto reply</h2></div>
        <label className="block"><span className="label-mini">Fallback reply</span><span className="secretary-help">Optional message sent when an incoming customer message does not match any active reply step.</span><textarea value={settings.fallbackResponse} onChange={(event) => setSettings((current) => ({ ...current, fallbackResponse: event.target.value }))} className="control-mini min-h-[92px] w-full resize-y" placeholder="Thanks for your message. How can I help you?" /></label>
        <label className="block"><span className="label-mini">Fallback photo · optional</span><span className="secretary-help">Photo fallback is not supported by the current automation API, so this field is unavailable.</span><input disabled className="control-mini w-full bg-slate-50" placeholder="Photo upload is not available yet" /></label>
        <p className="secretary-muted">Fallback buttons and photo upload are not supported by the current automation API.</p>
        <AdminSwitch checked={settings.enabled} onChange={(enabled) => setSettings((current) => ({ ...current, enabled }))} label="Secretary enabled" description="Customers receive one automatic reply per 24 hours. A human reply restarts the 24-hour wait." />
        <label className="block"><span className="label-mini">Fallback behavior</span><span className="secretary-help">Turn on the fallback reply above for messages with no matching step.</span><select value={settings.fallbackEnabled ? "enabled" : "disabled"} onChange={(event) => setSettings((current) => ({ ...current, fallbackEnabled: event.target.value === "enabled" }))} className="control-mini w-full"><option value="disabled">Disabled</option><option value="enabled">Enabled</option></select></label>
        <div className="flex justify-end border-t border-slate-200 pt-2"><button type="button" onClick={() => void saveSettings()} disabled={busy} className="h-9 px-3 bg-slate-900 text-white text-[10px] font-bold uppercase tracking-widest disabled:opacity-50">{busy ? "Saving…" : "Save auto reply settings"}</button></div>
        </section>
      </AdminDisclosure>

      <section className="secretary-steps-section">
        <div className="flex items-center justify-between gap-2 px-0.5">
            <div><h2 className="text-lg font-normal uppercase tracking-wide">Reply steps</h2><p className="text-xs text-slate-500">Each step matches an incoming message and sends its saved reply. Open one step at a time to edit it.</p></div>
          <span className="shrink-0 text-[10px] font-mono text-slate-500">{displayedFlows.length} TOTAL</span>
        </div>
        <label className="secretary-main-menu block"><span className="label-mini">Welcome step · sent after 24 hours</span><span className="secretary-help">Choose the first message to send when a customer becomes eligible again, or leave it off.</span><select value={settings.welcomeFlowId} onChange={(event) => setSettings((current) => ({ ...current, welcomeFlowId: event.target.value }))} className="control-mini w-full"><option value="">No welcome step</option>{flows.filter((flow) => flow.active).map((flow) => <option key={flow.id} value={flow.id}>{flow.name}</option>)}</select></label>
        {loading ? <div className="admin-empty"><p>Loading Secretary steps…</p></div> : displayedFlows.length === 0 ? <div className="admin-empty"><MessageSquare className="admin-empty__icon" /><strong>No steps configured</strong><p>Add a step to begin building the reply flow.</p></div> : displayedFlows.map((flow) => {
          const isOpen = selected?.id === flow.id;
          const inbound = flows.reduce((sum, item) => sum + item.buttons.filter((button) => button.targetFlowId === flow.id).length, 0);
          return <details key={flow.id} open={isOpen} className="secretary-step-card" onToggle={(event) => { const open = event.currentTarget.open; if (open && selected?.id !== flow.id) { setSelected(flow); setExpandedButton(""); setStepTab("trigger"); } else if (!open && selected?.id === flow.id) setSelected(null); }}>
            <summary className="secretary-step-summary">
              <span className={`secretary-step-indicator ${flow.active ? "is-active" : ""}`} />
              <span className="min-w-0 flex-1"><strong>{flow.name}</strong><small>{inbound} incoming · {flow.buttons.length} buttons{settings.welcomeFlowId === flow.id ? " · Welcome" : ""}</small></span>
              <ChevronRight className="h-4 w-4 shrink-0 transition-transform" />
            </summary>
            {isOpen && selected && <div className="secretary-step-content">
              <nav className="secretary-step-tabs" role="tablist" aria-label="Secretary step settings">
                {([
                  ["trigger", "1. Trigger"],
                  ["reply", "2. Reply"],
                  ["buttons", "3. Buttons"],
                ] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={stepTab === id} onClick={() => setStepTab(id)} className={stepTab === id ? "is-active" : ""}>{label}</button>)}
              </nav>

              {stepTab === "trigger" && <section className="secretary-step-fields" role="tabpanel">
                <div className="secretary-step-intro"><strong>Choose when this reply runs</strong><p>Set the internal name and the customer message or button event that should activate this step.</p></div>
                <label className="block"><span className="label-mini">Step name</span><span className="secretary-help">Private label for organizing your flow. Customers do not see this name.</span><input value={selected.name} onChange={(event) => updateSelected({ name: event.target.value })} className="control-mini w-full" placeholder="Welcome / Products" /></label>
                <label className="block"><span className="label-mini">Priority</span><span className="secretary-help">When multiple steps match, the lower number is checked first.</span><input type="number" min="1" value={selected.priority} onChange={(event) => updateSelected({ priority: Number(event.target.value) || 100 })} className="control-mini w-full" /></label>
                <AdminSwitch checked={selected.active} onChange={(active) => updateSelected({ active })} label="Step active" description="Inactive steps are skipped by the reply engine." />
                <label className="block"><span className="label-mini">Trigger type</span><span className="secretary-help">Choose a customer message for normal replies, or a button callback when another button should return to this step.</span><select value={selected.triggerType} onChange={(event) => updateSelected({ triggerType: event.target.value as Flow["triggerType"] })} className="control-mini w-full"><option value="message">Incoming message</option><option value="callback">Button callback</option></select></label>
                {selected.triggerType === "message" ? <>
                  <label className="block"><span className="label-mini">Message matching</span><span className="secretary-help">Contains matches a phrase anywhere; Exact requires the whole message; Starts with checks only its beginning.</span><select value={selected.matchMode} onChange={(event) => updateSelected({ matchMode: event.target.value as Flow["matchMode"] })} className="control-mini w-full"><option value="contains">Contains</option><option value="exact">Exact match</option><option value="starts_with">Starts with</option></select></label>
                  <label className="block"><span className="label-mini">Customer message to match</span><span className="secretary-help">Enter a word or phrase customers may send. Leave blank only when this step should match any incoming message.</span><input value={selected.triggerValue} onChange={(event) => updateSelected({ triggerValue: event.target.value })} className="control-mini w-full" placeholder="For example: product list" /></label>
                </> : <p className="secretary-step-intro">This step runs when a reply button routes to it. Set that button’s target in the Buttons section.</p>}
              </section>}

              {stepTab === "reply" && <section className="secretary-step-fields" role="tabpanel">
                <div className="secretary-step-intro"><strong>Write the customer reply</strong><p>This is the message shown when the trigger matches. Add an optional photo to appear in the same Telegram message bubble.</p></div>
                <label className="block"><span className="label-mini">Reply message</span><span className="secretary-help">Text customers receive for this step. Use {'{{name}}'} to insert their Telegram first name.</span><textarea value={selected.responseText} onChange={(event) => updateSelected({ responseText: event.target.value })} className="control-mini min-h-[110px] w-full resize-y" placeholder="Hi {{name}}, welcome to PRIME." /></label>
                <div className="block"><span className="label-mini">Reply photo · optional</span><span className="secretary-help">Choose an image file from this device. The uploaded photo is sent with this reply; it is not a URL field.</span><div className="mt-2 flex items-center gap-2">{selected.mediaUrl && <TelegramMediaImage src={selected.mediaUrl} alt="Secretary photo preview" className="h-16 w-24 shrink-0 border border-slate-200 object-cover"/>}<label className="control-mini flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-1.5">{uploadingPhoto ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <ImagePlus className="h-3.5 w-3.5"/>}{uploadingPhoto ? "Uploading photo…" : selected.mediaUrl ? "Replace photo" : "Choose image file"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy || uploadingPhoto} onChange={async (event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (!file) return; setUploadingPhoto(true); setError(""); setNotice(""); try { const mediaUrl = await uploadStaffImage(file, "media-gallery"); updateSelected({ mediaUrl }); setNotice("Secretary photo uploaded and ready to save."); } catch (err: any) { setError(err?.message || "Could not upload Secretary photo."); } finally { setUploadingPhoto(false); } }}/></label>{selected.mediaUrl && <button type="button" className="control-mini" disabled={busy || uploadingPhoto} onClick={() => updateSelected({ mediaUrl: "" })}>Remove</button>}</div></div>
                <div className="secretary-message-preview rounded-md bg-slate-950 p-3 text-white"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-300">Preview</span>{selected.mediaUrl && <TelegramMediaImage src={selected.mediaUrl} alt="Reply photo preview" className="secretary-message-preview__image" />}<div className="whitespace-pre-wrap break-words text-xs">{selected.responseText || "Your reply text will appear here."}</div></div>
              </section>}

              {stepTab === "buttons" && <section className="secretary-step-fields" role="tabpanel">
                <div className="secretary-step-intro"><strong>Add optional reply buttons</strong><p>Buttons are attached below the message. Choose whether each one opens another step, edits this reply, or opens a website.</p></div>
                <div className="space-y-2">
                  {selected.buttons.map((button, index) => {
                    const open = expandedButton === button.id;
                    const bytes = callbackBytes(selected.id || "new", button.id);
                    return <div key={button.id} className="secretary-button-card">
                      <label className="block"><span className="label-mini">Button {index + 1} · label</span><span className="secretary-help">Short text displayed on the button in Telegram.</span><input value={button.text} onChange={(event) => updateButton(index, { text: event.target.value })} className="control-mini w-full" placeholder="Button label" /></label>
                      <label className="block"><span className="label-mini">Button action</span><span className="secretary-help">Open a saved step, replace the current message with another reply, or open a web link.</span><select value={button.action} onChange={(event) => updateButton(index, { action: event.target.value as Action })} className="control-mini w-full"><option value="flow">Open another step</option><option value="reply">Edit this message</option><option value="url">Open a link</option></select></label>
                      <button type="button" aria-expanded={open} onClick={() => setExpandedButton(open ? "" : button.id)} className="text-[10px] font-bold uppercase text-slate-700">{open ? "Hide action settings" : "Show action settings"}</button>
                      {open && <div className="space-y-2">
                        {button.action === "flow" && <label className="block"><span className="label-mini">Target step</span><span className="secretary-help">The step customers open after pressing this button.</span><select value={button.targetFlowId} onChange={(event) => updateButton(index, { targetFlowId: event.target.value })} className="control-mini w-full"><option value="">Select next step</option>{flows.filter((item) => item.id !== selected.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
                        {button.action === "reply" && <label className="block"><span className="label-mini">In-place response</span><span className="secretary-help">New text that replaces the message in the same chat bubble when pressed.</span><textarea value={button.response} onChange={(event) => updateButton(index, { response: event.target.value })} className="control-mini min-h-[72px] w-full resize-y" placeholder="The same message bubble is edited." /></label>}
                        {button.action === "url" && <label className="block"><span className="label-mini">Destination URL</span><span className="secretary-help">A complete website address opened when customers press this button.</span><input value={button.url} onChange={(event) => updateButton(index, { url: event.target.value })} className="control-mini w-full" placeholder="https://…" /></label>}
                        <div className="flex items-center justify-between gap-2"><span className={`text-[10px] font-mono ${bytes > 64 ? "text-red-600 font-bold" : "text-slate-400"}`}>CALLBACK {bytes}/64 BYTES</span><button type="button" onClick={() => removeButton(index)} className="h-7 px-2 border border-red-200 text-red-600 text-[10px] font-bold uppercase">Remove button</button></div>
                      </div>}
                    </div>;
                  })}
                  <button type="button" onClick={addButton} className="h-9 w-full border border-dashed border-slate-300 text-[10px] font-bold uppercase flex items-center justify-center gap-1"><Plus className="h-3 w-3" /> Add button</button>
                </div>
              </section>}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
                <div className="min-w-0 text-[10px] font-mono text-slate-400">{parent ? <span className="inline-flex items-center gap-1">FROM {parent.name}<ArrowRight className="h-2.5 w-2.5" />{selected.name}</span> : "ROOT STEP"}</div>
                <div className="flex items-center gap-1.5"><button type="button" onClick={() => void deleteFlow()} disabled={!selected.id || busy} className="h-8 px-2 border border-red-200 text-red-600 text-[10px] font-bold uppercase disabled:opacity-40"><Trash2 className="mr-1 inline h-3 w-3" />Delete</button><button type="button" onClick={() => void saveFlow()} disabled={busy || uploadingPhoto} className="h-8 px-3 bg-slate-900 text-white text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 disabled:opacity-50">{busy ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}Save step</button></div>
              </div>
            </div>}
          </details>;
        })}
      </section>

      <AdminDisclosure title="Message preview" meta="Telegram message bubble">
        <div className="secretary-message-preview rounded-md bg-slate-950 p-3 text-white">
          {selected?.mediaUrl && <TelegramMediaImage src={selected.mediaUrl} alt="Secretary step preview" className="secretary-message-preview__image" />}
          <div className="whitespace-pre-wrap break-words text-xs">{testMode && !testChatId ? "Choose a recent customer chat to preview." : selected?.responseText || "Select a reply step to preview."}</div>
          {selected?.buttons.length ? <div className="mt-2 grid grid-cols-2 gap-1 border-t border-white/10 pt-2">{selected.buttons.map((button) => <div key={button.id} className="min-w-0 border border-white/10 px-2 py-1.5 text-[10px]"><span className="block truncate">{button.text}</span><span className="text-slate-400">{button.action === "flow" ? "Opens step" : button.action === "url" ? "Opens link" : "Edits message"}</span></div>)}</div> : <div className="mt-2 text-[10px] text-slate-500">No inline buttons.</div>}
        </div>
      </AdminDisclosure>

      <AdminDisclosure title="Recent customer chats" meta={`${chats.length} tracked`}>
        {chats.length === 0 ? <p className="text-[10px] text-slate-500">No customer chats yet.</p> : <div className="space-y-1.5">{chats.map((chat) => <div key={chat.business_connection_id + ":" + chat.chat_id} className="secretary-chat-card"><div className="min-w-0 flex-1"><strong>Chat {chat.chat_id}</strong><small>Last customer: {chat.last_customer_message_at ? new Date(chat.last_customer_message_at).toLocaleString() : "—"}</small></div><button type="button" onClick={() => void toggleChat(chat)} className="shrink-0"><span>{chat.bot_paused ? "Resume" : "Pause"}</span></button></div>)}</div>}
      </AdminDisclosure>
    </div>
  );
}
