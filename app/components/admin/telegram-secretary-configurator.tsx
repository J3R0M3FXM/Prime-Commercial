"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  Check,
  ChevronRight,
  ExternalLink,
  GitBranch,
  Link2,
  MessageSquare,
  Plus,
  Power,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";

type ButtonAction = "flow" | "reply" | "url" | "media" | "caption" | "markup";

type SecretaryButton = {
  id: string;
  text: string;
  response?: string;
  url?: string;
  action?: ButtonAction;
  targetFlowId?: string;
  mediaUrl?: string;
  mediaType?: string;
  caption?: string;
  parseMode?: string;
  replyMarkup?: any;
};

type Flow = {
  id: string;
  name: string;
  active: boolean;
  triggerType: "message" | "callback";
  triggerValue: string;
  matchMode: "exact" | "contains" | "starts_with";
  responseText: string;
  buttons: SecretaryButton[];
  priority: number;
};

type Chat = {
  business_connection_id: string;
  chat_id: number;
  last_customer_message_at?: string | null;
  last_human_message_at?: string | null;
  last_bot_message_at?: string | null;
  human_takeover_until?: string | null;
  bot_paused?: boolean;
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

const ACTION_OPTIONS: Array<[ButtonAction, string]> = [
  ["flow", "GO TO STEP"],
  ["reply", "REPLY IN PLACE"],
  ["url", "OPEN URL"],
  ["media", "EDIT MEDIA"],
  ["caption", "EDIT CAPTION"],
  ["markup", "EDIT KEYBOARD"],
];

function makeButton(index: number): SecretaryButton {
  return {
    id: `btn_${Date.now().toString(36)}_${index}`,
    text: "New Button",
    action: "flow",
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
    responseText: "Enter the message content for this step.",
    buttons: [],
    priority: 100,
  };
}

function normalizeButton(button: any, index: number): SecretaryButton {
  const action = String(button?.action || "").toLowerCase();
  const safeAction: ButtonAction = ACTION_OPTIONS.some(([value]) => value === action)
    ? (action as ButtonAction)
    : button?.url
      ? "url"
      : "reply";

  return {
    id: String(button?.id || makeButton(index).id),
    text: String(button?.text || "Option"),
    response: String(button?.response || ""),
    url: String(button?.url || ""),
    action: safeAction,
    targetFlowId: String(button?.targetFlowId || ""),
    mediaUrl: String(button?.mediaUrl || ""),
    mediaType: String(button?.mediaType || "photo"),
    caption: String(button?.caption || ""),
    parseMode: String(button?.parseMode || ""),
    replyMarkup: button?.replyMarkup,
  };
}

function normalizeFlow(flow: any): Flow {
  return {
    id: String(flow?.id || ""),
    name: String(flow?.name || "Secretary Step"),
    active: flow?.active !== false,
    triggerType: flow?.triggerType === "callback" ? "callback" : "message",
    triggerValue: String(flow?.triggerValue || ""),
    matchMode: ["exact", "contains", "starts_with"].includes(flow?.matchMode)
      ? flow.matchMode
      : "contains",
    responseText: String(flow?.responseText || ""),
    buttons: Array.isArray(flow?.buttons) ? flow.buttons.map(normalizeButton) : [],
    priority: Number(flow?.priority) || 100,
  };
}

function callbackBytes(flowId: string, buttonId: string) {
  return new TextEncoder().encode(`sec:${flowId}:${buttonId}`).length;
}

function actionLabel(action?: ButtonAction) {
  return ACTION_OPTIONS.find(([value]) => value === (action || "reply"))?.[1] || "REPLY IN PLACE";
}

function inboundCount(flowId: string, flows: Flow[]) {
  return flows.reduce(
    (count, flow) => count + flow.buttons.filter((button) => button.targetFlowId === flowId).length,
    0,
  );
}

function firstParent(flowId: string, flows: Flow[]) {
  return flows.find((flow) => flow.buttons.some((button) => button.targetFlowId === flowId))?.id || "";
}

export default function TelegramSecretaryConfigurator() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selected, setSelected] = useState<Flow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [activeButtonId, setActiveButtonId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/automation", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load Secretary configuration.");

      const nextFlows = (data.flows || []).map(normalizeFlow);
      setFlows(nextFlows);
      setChats(data.chats || []);
      setSettings({ ...DEFAULT_SETTINGS, ...(data.settings || {}) });
      if (selected?.id) {
        const refreshed = nextFlows.find((flow: Flow) => flow.id === selected.id);
        setSelected(refreshed || null);
      }
    } catch (error: any) {
      setMessage(error?.message || "Failed to load Secretary configuration.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const rootFlows = useMemo(
    () =>
      flows.filter(
        (flow) =>
          flow.id === settings.welcomeFlowId ||
          (flow.buttons.length === 0 && inboundCount(flow.id, flows) === 0),
      ),
    [flows, settings.welcomeFlowId],
  );

  const path = useMemo(() => {
    if (!selected?.id) return [];
    const chain: Flow[] = [];
    const seen = new Set<string>();
    let currentId = selected.id;

    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      const current = flows.find((flow) => flow.id === currentId);
      if (!current) break;
      chain.unshift(current);
      currentId = firstParent(currentId, flows);
    }

    return chain;
  }, [selected?.id, flows]);

  const updateSelected = (patch: Partial<Flow>) => {
    setSelected((current) => (current ? { ...current, ...patch } : current));
  };

  const updateButton = (index: number, patch: Partial<SecretaryButton>) => {
    setSelected((current) =>
      current
        ? {
            ...current,
            buttons: current.buttons.map((button, itemIndex) =>
              itemIndex === index ? { ...button, ...patch } : button,
            ),
          }
        : current,
    );
  };

  const addButton = () => {
    setSelected((current) =>
      current
        ? {
            ...current,
            buttons: [...current.buttons, makeButton(current.buttons.length + 1)],
          }
        : current,
    );
  };

  const deleteButton = (index: number) => {
    setSelected((current) =>
      current
        ? {
            ...current,
            buttons: current.buttons.filter((_, itemIndex) => itemIndex !== index),
          }
        : current,
    );
  };

  const createFlow = () => {
    setSelected(makeFlow());
    setActiveButtonId(null);
    setMessage("");
  };

  const saveSettings = async () => {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/automation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "settings", ...settings }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to save Secretary settings.");
      setSettings({ ...DEFAULT_SETTINGS, ...data });
      setMessage("SECRETARY ENGINE SETTINGS SAVED.");
    } catch (error: any) {
      setMessage(error?.message || "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const saveFlow = async () => {
    if (!selected) return;

    const trimmedName = selected.name.trim();
    const trimmedResponse = selected.responseText.trim();
    if (!trimmedName || !trimmedResponse) {
      setMessage("STEP NAME AND MESSAGE RESPONSE ARE REQUIRED.");
      return;
    }

    const invalidTarget = selected.buttons.find(
      (button) => button.action === "flow" && (!button.targetFlowId || button.targetFlowId === selected.id),
    );
    if (invalidTarget) {
      setMessage(`BUTTON "${invalidTarget.text}" NEEDS A DIFFERENT TARGET STEP.`);
      return;
    }

    const overLimit = selected.buttons.find(
      (button) => callbackBytes(selected.id || "new_step", button.id) > 64,
    );
    if (overLimit) {
      setMessage(`CALLBACK DATA TOO LONG FOR "${overLimit.text}". USE A SHORTER BUTTON ID.`);
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const method = selected.id ? "PUT" : "POST";
      const response = await fetch("/api/admin/automation", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...selected,
          name: trimmedName,
          responseText: trimmedResponse,
          buttons: selected.buttons.map((button) => ({
            ...button,
            text: String(button.text || "Option").trim().slice(0, 64),
            response: String(button.response || ""),
            url: String(button.url || "").trim(),
            targetFlowId: String(button.targetFlowId || "").trim(),
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to save Secretary step.");

      const normalized = normalizeFlow(data);
      setFlows((current) =>
        selected.id
          ? current.map((flow) => (flow.id === normalized.id ? normalized : flow))
          : [...current, normalized],
      );
      setSelected(normalized);
      setMessage("SECRETARY STEP SAVED.");
    } catch (error: any) {
      setMessage(error?.message || "Failed to save Secretary step.");
    } finally {
      setSaving(false);
    }
  };

  const deleteSelected = async () => {
    if (!selected?.id) return;
    const references = flows.filter(
      (flow) => flow.id !== selected.id && flow.buttons.some((button) => button.targetFlowId === selected.id),
    );
    const warning = references.length
      ? `This step is linked from ${references.length} other step(s). Delete anyway?`
      : "Delete this Secretary step?";
    if (!window.confirm(warning)) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/admin/automation?id=${encodeURIComponent(selected.id)}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Delete failed.");

      setFlows((current) => current.filter((flow) => flow.id !== selected.id));
      if (settings.welcomeFlowId === selected.id) {
        setSettings((current) => ({ ...current, welcomeFlowId: "" }));
      }
      setSelected(null);
      setMessage("SECRETARY STEP DELETED.");
    } catch (error: any) {
      setMessage(error?.message || "Delete failed.");
    } finally {
      setSaving(false);
    }
  };

  const toggleChat = async (chat: Chat) => {
    const paused = !chat.bot_paused;
    try {
      const response = await fetch("/api/admin/automation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "chat_pause",
          businessConnectionId: chat.business_connection_id,
          chatId: chat.chat_id,
          paused,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to update chat.");
      setChats((current) =>
        current.map((item) =>
          item.business_connection_id === chat.business_connection_id && item.chat_id === chat.chat_id
            ? { ...item, bot_paused: paused, updated_at: data.updated_at }
            : item,
        ),
      );
    } catch (error: any) {
      setMessage(error?.message || "Failed to update chat.");
    }
  };

  return (
    <div className="space-y-2 text-slate-900">
      <div className="border-b border-slate-200 pb-1.5 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-slate-400">Telegram Business</div>
          <h1 className="text-lg font-heading uppercase tracking-tight font-black">Secretary / Inline Button Configurator</h1>
          <p className="text-[10px] text-slate-500 mt-0.5">Build one-bubble conversations as a linked flow of editable message steps.</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[9px] font-mono uppercase tracking-widest text-slate-400">
            {flows.length} STEPS / {flows.reduce((sum, flow) => sum + flow.buttons.length, 0)} BUTTONS
          </span>
          <button
            onClick={() => void load()}
            className="h-8 px-2 border border-slate-200 bg-white text-[9px] font-bold uppercase tracking-widest flex items-center gap-1"
            title="Reload configuration"
          >
            <RefreshCw className="w-3 h-3" /> Reload
          </button>
          <button
            onClick={createFlow}
            className="h-8 px-2.5 bg-slate-900 text-white text-[9px] font-bold uppercase tracking-widest flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> New Step
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_300px] border border-slate-200 bg-white">
        <aside className="border-b lg:border-b-0 lg:border-r border-slate-200 min-w-0">
          <div className="px-2 py-1.5 border-b border-slate-200 flex items-center justify-between">
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-slate-400">Flow map</div>
              <div className="text-xs font-heading uppercase font-black">Conversation steps</div>
            </div>
            <GitBranch className="w-3.5 h-3.5 text-slate-400" />
          </div>

          {loading ? (
            <div className="p-2 text-[10px] font-mono text-slate-400">LOADING...</div>
          ) : flows.length === 0 ? (
            <div className="p-2 text-[10px] text-slate-400">No steps configured.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {flows.map((flow) => {
                const children = flow.buttons.filter((button) => button.targetFlowId).length;
                const incoming = inboundCount(flow.id, flows);
                const isSelected = selected?.id === flow.id;
                const isWelcome = settings.welcomeFlowId === flow.id;

                return (
                  <button
                    key={flow.id}
                    type="button"
                    onClick={() => {
                      setSelected(flow);
                      setActiveButtonId(null);
                      setMessage("");
                    }}
                    className={`w-full text-left px-2 py-1.5 border-l-2 ${
                      isSelected ? "border-l-slate-900 bg-slate-50" : "border-l-transparent bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 ${
                        flow.active ? "bg-emerald-500" : "bg-slate-300"
                      }`} />
                      <span className="text-[11px] font-bold truncate flex-1">{flow.name}</span>
                      {isWelcome && <span className="text-[8px] px-1 bg-slate-900 text-white uppercase">WELCOME</span>}
                    </div>
                    <div className="mt-0.5 text-[9px] font-mono text-slate-400 flex items-center gap-2">
                      <span>IN {incoming}</span>
                      <span>OUT {children}</span>
                      <span className="truncate">{flow.id}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="border-t border-slate-200 px-2 py-1.5">
            <div className="text-[9px] uppercase tracking-widest font-bold text-slate-400 mb-1">Root / welcome</div>
            {rootFlows.length === 0 ? (
              <div className="text-[9px] text-slate-400">Pick a Welcome Step in Engine Settings.</div>
            ) : (
              <div className="space-y-0.5">
                {rootFlows.slice(0, 4).map((flow) => (
                  <button
                    key={flow.id}
                    type="button"
                    onClick={() => setSettings((current) => ({ ...current, welcomeFlowId: flow.id }))}
                    className={`w-full px-1.5 py-1 border text-left text-[9px] uppercase ${
                      settings.welcomeFlowId === flow.id
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {flow.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        <main className="min-w-0 border-b lg:border-b-0 lg:border-r border-slate-200">
          {!selected ? (
            <div className="min-h-[260px] flex items-center justify-center p-3 text-center">
              <div>
                <MessageSquare className="w-7 h-7 mx-auto text-slate-300 mb-1.5" />
                <div className="text-xs font-bold uppercase">Select a step</div>
                <p className="text-[10px] text-slate-400 mt-0.5">Or create a new step to start building the hierarchy.</p>
              </div>
            </div>
          ) : (
            <div>
              <div className="px-2 py-1.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                <div className="min-w-0">
                  <div className="text-[9px] font-mono uppercase tracking-widest text-slate-400">Step editor</div>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-bold truncate">{selected.name}</span>
                    {selected.id && (
                      <span className="text-[8px] font-mono text-slate-400 truncate max-w-[190px]">{selected.id}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <label className="flex items-center gap-1 text-[9px] uppercase font-bold text-slate-500">
                    <input
                      type="checkbox"
                      checked={selected.active}
                      onChange={(event) => updateSelected({ active: event.target.checked })}
                    />
                    Active
                  </label>
                  <button
                    onClick={deleteSelected}
                    disabled={!selected.id || saving}
                    className="h-7 px-2 border border-red-200 text-red-600 text-[9px] font-bold uppercase disabled:opacity-40 flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
              </div>

              <div className="p-2 space-y-2">
                <div className="grid sm:grid-cols-[1.15fr_.85fr] gap-1.5">
                  <label className="block">
                    <span className="label-mini">Step name</span>
                    <input
                      value={selected.name}
                      onChange={(event) => updateSelected({ name: event.target.value })}
                      className="control-mini"
                      placeholder="WELCOME / PRODUCTS / PAYMENT"
                    />
                  </label>
                  <label className="block">
                    <span className="label-mini">Priority</span>
                    <input
                      type="number"
                      value={selected.priority}
                      onChange={(event) => updateSelected({ priority: Number(event.target.value) || 100 })}
                      className="control-mini"
                    />
                  </label>
                </div>

                <div className="grid sm:grid-cols-[150px_minmax(0,1fr)_140px] gap-1.5">
                  <label className="block">
                    <span className="label-mini">Trigger type</span>
                    <select
                      value={selected.triggerType}
                      onChange={(event) => updateSelected({ triggerType: event.target.value as Flow["triggerType"] })}
                      className="control-mini"
                    >
                      <option value="message">Incoming message</option>
                      <option value="callback">Callback data</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="label-mini">Trigger value</span>
                    <input
                      value={selected.triggerValue}
                      onChange={(event) => updateSelected({ triggerValue: event.target.value })}
                      className="control-mini"
                      placeholder="Optional for a welcome step"
                    />
                  </label>
                  <label className="block">
                    <span className="label-mini">Match</span>
                    <select
                      value={selected.matchMode}
                      onChange={(event) =>
                        updateSelected({
                          matchMode: event.target.value as Flow["matchMode"],
                        })
                      }
                      className="control-mini"
                    >
                      <option value="contains">Contains</option>
                      <option value="exact">Exact</option>
                      <option value="starts_with">Starts with</option>
                    </select>
                  </label>
                </div>

                <div>
                  <label className="label-mini">Message bubble content</label>
                  <textarea
                    value={selected.responseText}
                    onChange={(event) => updateSelected({ responseText: event.target.value })}
                    className="w-full min-h-[88px] border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-slate-900 resize-y"
                    placeholder="Hi {{name}}, welcome to PRIME. Choose an option below."
                  />
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="text-[8px] text-slate-400 font-mono">Templates: {{name}} · {{username}} · {{user_id}}</span>
                    {selected.id && <span className="text-[8px] font-mono text-slate-400">{selected.responseText.length}/4096</span>}
                  </div>
                </div>

                <div className="border-t border-slate-200">
                  <div className="py-1.5 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[9px] font-mono uppercase tracking-widest text-slate-400">Inline keyboard</div>
                      <div className="text-[10px] text-slate-500">Each row stays on this bubble. GO TO STEP edits the same message into the target step.</div>
                    </div>
                    <button
                      onClick={addButton}
                      className="h-7 px-2 border border-slate-200 text-[9px] font-bold uppercase flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Add button
                    </button>
                  </div>

                  <div className="divide-y divide-slate-200 border-t border-slate-200">
                    {selected.buttons.length === 0 ? (
                      <div className="p-2 text-[10px] text-slate-400">No inline buttons. Add the first branch.</div>
                    ) : (
                      selected.buttons.map((button, index) => {
                        const bytes = callbackBytes(selected.id || "new_step", button.id);
                        const expanded = activeButtonId === button.id;
                        return (
                          <div key={button.id} className={`p-1.5 ${expanded ? "bg-slate-50" : "bg-white"}`}>
                            <div className="grid grid-cols-[28px_minmax(0,1fr)_120px_28px] gap-1.5 items-center">
                              <span className="text-[8px] font-mono text-slate-400 text-center">#{index + 1}</span>
                              <input
                                value={button.text}
                                onChange={(event) => updateButton(index, { text: event.target.value })}
                                className="control-mini"
                                placeholder="Button label"
                              />
                              <select
                                value={button.action || "reply"}
                                onChange={(event) =>
                                  updateButton(index, {
                                    action: event.target.value as ButtonAction,
                                  })
                                }
                                className="control-mini"
                              >
                                {ACTION_OPTIONS.map(([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => setActiveButtonId(expanded ? null : button.id)}
                                className="h-8 w-8 border border-slate-200 flex items-center justify-center"
                                title="Expand button settings"
                              >
                                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
                              </button>
                            </div>

                            {expanded && (
                              <div className="mt-1.5 grid gap-1.5">
                                {(button.action || "reply") === "flow" && (
                                  <div className="grid sm:grid-cols-[minmax(0,1fr)_120px] gap-1.5">
                                    <label className="block">
                                      <span className="label-mini">Target step</span>
                                      <select
                                        value={button.targetFlowId || ""}
                                        onChange={(event) =>
                                          updateButton(index, { targetFlowId: event.target.value })
                                        }
                                        className="control-mini"
                                      >
                                        <option value="">Select next step</option>
                                        {flows
                                          .filter((flow) => flow.id !== selected.id)
                                          .map((flow) => (
                                            <option key={flow.id} value={flow.id}>
                                              {flow.name}
                                            </option>
                                          ))}
                                      </select>
                                    </label>
                                    <div className="border border-slate-200 bg-white px-1.5 py-1">
                                      <div className="label-mini">Route</div>
                                      <div className="text-[9px] font-mono text-slate-600 truncate">
                                        {button.targetFlowId
                                          ? flows.find((flow) => flow.id === button.targetFlowId)?.name || "Broken target"
                                          : "Not linked"}
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {(button.action || "reply") === "reply" && (
                                  <label className="block">
                                    <span className="label-mini">In-place response</span>
                                    <textarea
                                      value={button.response || ""}
                                      onChange={(event) => updateButton(index, { response: event.target.value })}
                                      className="w-full min-h-[58px] border border-slate-200 px-2 py-1.5 text-[10px] outline-none focus:border-slate-900 resize-y bg-white"
                                      placeholder="Response after clicking this button. The same bubble is edited."
                                    />
                                  </label>
                                )}

                                {(button.action || "reply") === "url" && (
                                  <label className="block">
                                    <span className="label-mini">Destination URL</span>
                                    <input
                                      value={button.url || ""}
                                      onChange={(event) => updateButton(index, { url: event.target.value })}
                                      className="control-mini"
                                      placeholder="https://example.com/..."
                                    />
                                  </label>
                                )}

                                {(button.action || "reply") === "media" && (
                                  <div className="grid sm:grid-cols-[120px_minmax(0,1fr)] gap-1.5">
                                    <label className="block">
                                      <span className="label-mini">Media type</span>
                                      <select
                                        value={button.mediaType || "photo"}
                                        onChange={(event) => updateButton(index, { mediaType: event.target.value })}
                                        className="control-mini"
                                      >
                                        <option value="photo">Photo</option>
                                        <option value="video">Video</option>
                                        <option value="document">Document</option>
                                      </select>
                                    </label>
                                    <label className="block">
                                      <span className="label-mini">Media URL / file_id</span>
                                      <input
                                        value={button.mediaUrl || ""}
                                        onChange={(event) => updateButton(index, { mediaUrl: event.target.value })}
                                        className="control-mini"
                                        placeholder="Telegram file_id or HTTPS media URL"
                                      />
                                    </label>
                                    <label className="block sm:col-span-2">
                                      <span className="label-mini">Caption</span>
                                      <input
                                        value={button.caption || ""}
                                        onChange={(event) => updateButton(index, { caption: event.target.value })}
                                        className="control-mini"
                                        placeholder="Optional media caption"
                                      />
                                    </label>
                                  </div>
                                )}

                                {(button.action || "reply") === "caption" && (
                                  <label className="block">
                                    <span className="label-mini">Caption text</span>
                                    <textarea
                                      value={button.caption || button.response || ""}
                                      onChange={(event) =>
                                        updateButton(index, { caption: event.target.value })
                                      }
                                      className="w-full min-h-[58px] border border-slate-200 px-2 py-1.5 text-[10px] outline-none focus:border-slate-900 resize-y bg-white"
                                    />
                                  </label>
                                )}

                                {(button.action || "reply") === "markup" && (
                                  <div className="border border-amber-200 bg-amber-50 px-1.5 py-1 text-[9px] font-mono text-amber-800">
                                    Advanced reply-markup is kept for future Secretary/Serverless adapters. Configure JSON in the API layer for now.
                                  </div>
                                )}

                                <div className="flex items-center justify-between gap-2">
                                  <span className={`text-[8px] font-mono ${
                                    bytes > 64 ? "text-red-600 font-bold" : "text-slate-400"
                                  }`}>
                                    CALLBACK {bytes}/64 BYTES · {actionLabel(button.action)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => deleteButton(index)}
                                    className="h-7 px-2 border border-red-200 text-red-600 text-[9px] font-bold uppercase flex items-center gap-1"
                                  >
                                    <Trash2 className="w-3 h-3" /> Remove button
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 px-2 py-1.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  {message && (
                    <div className="text-[9px] font-mono uppercase text-slate-600 truncate">{message}</div>
                  )}
                </div>
                <button
                  onClick={() => void saveFlow()}
                  disabled={saving}
                  className="h-8 px-2.5 bg-slate-900 text-white text-[9px] font-bold uppercase tracking-widest flex items-center gap-1 shrink-0 disabled:opacity-50"
                >
                  {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  Save step
                </button>
              </div>
            </div>
          )}
        </main>

        <section className="min-w-0 bg-slate-50">
          <div className="px-2 py-1.5 border-b border-slate-200">
            <div className="text-[9px] font-mono uppercase tracking-widest text-slate-400">One-bubble preview</div>
            <div className="text-xs font-heading uppercase font-black">Customer view map</div>
          </div>

          <div className="p-2 space-y-2">
            <div className="border border-slate-200 bg-white p-2">
              <div className="text-[8px] font-mono uppercase text-slate-400 mb-1">path</div>
              <div className="flex items-center flex-wrap gap-1 text-[8px] font-mono">
                {path.length ? path.map((flow, index) => (
                  <span key={flow.id} className="inline-flex items-center gap-1">
                    {index > 0 && <ArrowRight className="w-2.5 h-2.5 text-slate-300" />}
                    <button
                      type="button"
                      onClick={() => setSelected(flow)}
                      className="px-1 py-0.5 border border-slate-200 bg-slate-50 uppercase"
                    >
                      {flow.name}
                    </button>
                  </span>
                )) : <span className="text-slate-400">Select a step</span>}
              </div>
            </div>

            <div className="border border-slate-300 bg-white p-2">
              <div className="flex items-center gap-1 mb-1">
                <MessageSquare className="w-3 h-3 text-slate-500" />
                <span className="text-[8px] font-mono uppercase tracking-widest text-slate-400">telegram bubble</span>
              </div>
              <div className="bg-slate-950 text-white p-2.5">
                <p className="text-[10px] leading-snug whitespace-pre-wrap break-words">
                  {selected?.responseText || "Select a step to preview the message."}
                </p>
                {selected?.buttons.length ? (
                  <div className="mt-1.5 border-t border-white/10 pt-1.5 grid gap-0.5">
                    {selected.buttons.map((button) => (
                      <button
                        key={button.id}
                        type="button"
                        onClick={() => setActiveButtonId(button.id)}
                        className="w-full border border-white/10 bg-white/5 hover:bg-white/10 px-1.5 py-1 text-left text-[9px] flex items-center justify-between"
                      >
                        <span className="truncate">{button.text || "Option"}</span>
                        <span className="font-mono text-[7px] text-slate-400">{actionLabel(button.action)}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-1.5 text-[8px] text-slate-500">NO INLINE BUTTONS</div>
                )}
              </div>
            </div>

            <div className="border border-slate-200 bg-white">
              <div className="px-2 py-1 border-b border-slate-200 text-[9px] uppercase tracking-widest font-bold">Selected route</div>
              <div className="p-2 space-y-1">
                {activeButtonId && selected ? (() => {
                  const button = selected.buttons.find((item) => item.id === activeButtonId);
                  if (!button) return null;
                  const target = button.targetFlowId ? flows.find((flow) => flow.id === button.targetFlowId) : null;
                  return (
                    <>
                      <div className="text-[10px] font-bold">{button.text}</div>
                      <div className="text-[8px] font-mono text-slate-400">{actionLabel(button.action)}</div>
                      <div className="flex items-center gap-1 text-[9px]">
                        <span className="px-1 py-0.5 border border-slate-200">{selected.name}</span>
                        <ArrowRight className="w-3 h-3 text-slate-300" />
                        <span className="px-1 py-0.5 border border-slate-200">{target?.name || "CURRENT RESPONSE"}</span>
                      </div>
                    </>
                  );
                })() : (
                  <span className="text-[9px] text-slate-400">Click a preview button to inspect its route.</span>
                )}
              </div>
            </div>

            <div className="border border-slate-200 bg-white">
              <div className="px-2 py-1 border-b border-slate-200 text-[9px] uppercase tracking-widest font-bold">Engine</div>
              <div className="p-2 space-y-1">
                <div className="flex items-center justify-between text-[9px]">
                  <span className="text-slate-500">Status</span>
                  <span className={`font-bold ${settings.enabled ? "text-emerald-700" : "text-slate-400"}`}>
                    {settings.enabled ? "ENABLED" : "DISABLED"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[9px]">
                  <span className="text-slate-500">Welcome</span>
                  <span className="font-mono text-slate-700 truncate max-w-[150px]">
                    {flows.find((flow) => flow.id === settings.welcomeFlowId)?.name || "NOT SET"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[9px]">
                  <span className="text-slate-500">Cooldown</span>
                  <span className="font-mono text-slate-700">24H INACTIVITY</span>
                </div>
              </div>
            </div>

            <div className="border border-slate-200 bg-white">
              <div className="px-2 py-1 border-b border-slate-200 text-[9px] uppercase tracking-widest font-bold">Current Business Session</div>
              <div className="p-2 space-y-1 text-[9px] font-mono">
                <div className="truncate">BUSINESS ID: {settings.businessUserId || "NOT CONNECTED"}</div>
                <div className="truncate">CONNECTION: {settings.businessConnectionId || "NOT CONNECTED"}</div>
                <div>CHATS: {chats.length}</div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="grid lg:grid-cols-[1fr_1fr] border border-slate-200 bg-white">
        <section className="min-w-0 border-b lg:border-b-0 lg:border-r border-slate-200">
          <div className="px-2 py-1.5 border-b border-slate-200">
            <div className="text-[9px] font-mono uppercase tracking-widest text-slate-400">Secretary engine</div>
            <div className="text-xs font-heading uppercase font-black">Welcome + cooldown control</div>
          </div>
          <div className="p-2 space-y-1.5">
            <div className="grid sm:grid-cols-3 gap-1.5">
              <label className="block">
                <span className="label-mini">Business User ID</span>
                <input readOnly value={settings.businessUserId || "Not connected"} className="control-mini bg-slate-50" />
              </label>
              <label className="block">
                <span className="label-mini">Business Connection</span>
                <input readOnly value={settings.businessConnectionId || "Not connected"} className="control-mini bg-slate-50" />
              </label>
              <label className="block">
                <span className="label-mini">Chat scope</span>
                <input readOnly value={settings.businessUserChatId || "Not connected"} className="control-mini bg-slate-50" />
              </label>
            </div>

            <div className="grid sm:grid-cols-[180px_1fr_auto] gap-1.5 items-end">
              <label className="block">
                <span className="label-mini">Welcome step</span>
                <select
                  value={settings.welcomeFlowId}
                  onChange={(event) => setSettings((current) => ({ ...current, welcomeFlowId: event.target.value }))}
                  className="control-mini"
                >
                  <option value="">Select a welcome step</option>
                  {flows.filter((flow) => flow.active).map((flow) => (
                    <option key={flow.id} value={flow.id}>
                      {flow.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="border border-slate-200 px-1.5 py-1 h-8 flex items-center gap-1.5 text-[9px]">
                <Power className="w-3 h-3 text-slate-500" />
                <span className="font-bold">24H COOLDOWN</span>
                <span className="text-slate-400">Reopens after the customer's last incoming message + 24 hours.</span>
              </div>

              <button
                onClick={() => setSettings((current) => ({ ...current, enabled: !current.enabled }))}
                className={`h-8 px-2 border text-[9px] font-bold uppercase flex items-center gap-1 ${
                  settings.enabled
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-50 text-slate-500"
                }`}
              >
                <Power className="w-3 h-3" />
                {settings.enabled ? "Enabled" : "Disabled"}
              </button>
            </div>

            <div className="grid sm:grid-cols-[1fr_auto] gap-1.5 items-end">
              <label className="block">
                <span className="label-mini">Fallback response</span>
                <input
                  value={settings.fallbackResponse}
                  onChange={(event) => setSettings((current) => ({ ...current, fallbackResponse: event.target.value }))}
                  className="control-mini"
                  placeholder="Optional fallback when no trigger matches."
                />
              </label>
              <label className="h-8 px-1.5 border border-slate-200 flex items-center gap-1.5 text-[9px] uppercase font-bold">
                <input
                  type="checkbox"
                  checked={settings.fallbackEnabled}
                  onChange={(event) => setSettings((current) => ({ ...current, fallbackEnabled: event.target.checked }))}
                />
                Fallback on
              </label>
            </div>

            <button
              onClick={() => void saveSettings()}
              disabled={saving}
              className="h-8 px-2.5 bg-slate-900 text-white text-[9px] font-bold uppercase tracking-widest flex items-center gap-1 disabled:opacity-50"
            >
              <Save className="w-3 h-3" /> Save engine settings
            </button>
          </div>
        </section>

        <section className="min-w-0">
          <div className="px-2 py-1.5 border-b border-slate-200">
            <div className="text-[9px] font-mono uppercase tracking-widest text-slate-400">Live customer control</div>
            <div className="text-xs font-heading uppercase font-black">Per-chat pause / human takeover</div>
          </div>
          <div className="p-2">
            {chats.length === 0 ? (
              <div className="text-[9px] text-slate-400">No chats have reached the Secretary webhook yet.</div>
            ) : (
              <div className="divide-y divide-slate-200 border border-slate-200">
                {chats.map((chat) => (
                  <div key={chat.business_connection_id + ":" + chat.chat_id} className="px-2 py-1.5 flex items-center justify-between gap-2">
                    <div className="min-w-0 font-mono">
                      <div className="text-[10px] font-bold truncate">CHAT {chat.chat_id}</div>
                      <div className="text-[8px] text-slate-400 truncate">
                        LAST CUSTOMER: {chat.last_customer_message_at ? new Date(chat.last_customer_message_at).toLocaleString() : "—"}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`text-[8px] px-1 py-0.5 font-bold uppercase ${
                        chat.bot_paused ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                      }`}>
                        {chat.bot_paused ? "PAUSED" : "ACTIVE"}
                      </span>
                      <button
                        onClick={() => void toggleChat(chat)}
                        className="h-7 px-2 border border-slate-200 text-[8px] font-bold uppercase"
                      >
                        {chat.bot_paused ? "Resume" : "Pause"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <style jsx>{`
        .label-mini {
          display: block;
          margin-bottom: 2px;
          font-size: 8px;
          line-height: 1;
          font-weight: 700;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: #64748b;
        }
        .control-mini {
          width: 100%;
          height: 30px;
          border: 1px solid #e2e8f0;
          padding: 0 7px;
          border-radius: 0;
          outline: 0;
          background: #fff;
          font-size: 10px;
          color: #0f172a;
        }
        .control-mini:focus {
          border-color: #0f172a;
        }
      `}</style>
    </div>
  );
}
