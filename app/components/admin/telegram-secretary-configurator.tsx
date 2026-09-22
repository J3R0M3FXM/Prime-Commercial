"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  ChevronRight,
  GitBranch,
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
  action: ButtonAction;
  response: string;
  url: string;
  targetFlowId: string;
  mediaUrl: string;
  mediaType: string;
  caption: string;
  parseMode: string;
  replyMarkup?: unknown;
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

const ACTIONS: Array<{ value: ButtonAction; label: string }> = [
  { value: "flow", label: "GO TO STEP" },
  { value: "reply", label: "REPLY IN PLACE" },
  { value: "url", label: "OPEN URL" },
  { value: "media", label: "EDIT MEDIA" },
  { value: "caption", label: "EDIT CAPTION" },
  { value: "markup", label: "EDIT KEYBOARD" },
];

function newButton(index: number): SecretaryButton {
  return {
    id: "b_" + Date.now().toString(36) + "_" + index,
    text: "New Button",
    action: "flow",
    response: "",
    url: "",
    targetFlowId: "",
    mediaUrl: "",
    mediaType: "photo",
    caption: "",
    parseMode: "",
  };
}

function newFlow(): Flow {
  return {
    id: "",
    name: "New Secretary Step",
    active: true,
    triggerType: "message",
    triggerValue: "",
    matchMode: "contains",
    responseText: "Enter the message shown in this bubble.",
    buttons: [],
    priority: 100,
  };
}

function normalizeButton(raw: any, index: number): SecretaryButton {
  const rawAction = String(raw?.action || (raw?.url ? "url" : "reply")).toLowerCase();
  const action = ACTIONS.some((item) => item.value === rawAction)
    ? (rawAction as ButtonAction)
    : "reply";

  return {
    id: String(raw?.id || newButton(index).id),
    text: String(raw?.text || "Option"),
    action,
    response: String(raw?.response || ""),
    url: String(raw?.url || ""),
    targetFlowId: String(raw?.targetFlowId || ""),
    mediaUrl: String(raw?.mediaUrl || ""),
    mediaType: String(raw?.mediaType || "photo"),
    caption: String(raw?.caption || ""),
    parseMode: String(raw?.parseMode || ""),
    replyMarkup: raw?.replyMarkup,
  };
}

function normalizeFlow(raw: any): Flow {
  return {
    id: String(raw?.id || ""),
    name: String(raw?.name || "Secretary Step"),
    active: raw?.active !== false,
    triggerType: raw?.triggerType === "callback" ? "callback" : "message",
    triggerValue: String(raw?.triggerValue || ""),
    matchMode: ["exact", "contains", "starts_with"].includes(raw?.matchMode)
      ? raw.matchMode
      : "contains",
    responseText: String(raw?.responseText || ""),
    buttons: Array.isArray(raw?.buttons)
      ? raw.buttons.map((button: any, index: number) => normalizeButton(button, index))
      : [],
    priority: Number(raw?.priority) || 100,
  };
}

function callbackLength(flowId: string, buttonId: string) {
  return new TextEncoder().encode("sec:" + flowId + ":" + buttonId).length;
}

export default function TelegramSecretaryConfigurator() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [chats, setChats] = useState<any[]>([]);
  const [selected, setSelected] = useState<Flow | null>(null);
  const [expandedButton, setExpandedButton] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      try {
        const response = await fetch("/api/admin/automation", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Failed to load Secretary configuration.");
        if (cancelled) return;

        const loadedFlows = Array.isArray(data?.flows)
          ? data.flows.map((flow: any) => normalizeFlow(flow))
          : [];

        setFlows(loadedFlows);
        setChats(Array.isArray(data?.chats) ? data.chats : []);
        setSettings({ ...DEFAULT_SETTINGS, ...(data?.settings || {}) });

        if (selected?.id) {
          setSelected(loadedFlows.find((flow: Flow) => flow.id === selected.id) || null);
        }
      } catch (error: any) {
        if (!cancelled) setNotice(error?.message || "Failed to load Secretary configuration.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [selected?.id]);

  function updateSelected(patch: Partial<Flow>) {
    setSelected((current) => (current ? { ...current, ...patch } : current));
  }

  function updateButton(index: number, patch: Partial<SecretaryButton>) {
    setSelected((current) => {
      if (!current) return current;
      return {
        ...current,
        buttons: current.buttons.map((button, buttonIndex) =>
          buttonIndex === index ? { ...button, ...patch } : button,
        ),
      };
    });
  }

  function addButton() {
    setSelected((current) =>
      current
        ? { ...current, buttons: [...current.buttons, newButton(current.buttons.length + 1)] }
        : current,
    );
  }

  function removeButton(index: number) {
    setSelected((current) =>
      current
        ? { ...current, buttons: current.buttons.filter((_, buttonIndex) => buttonIndex !== index) }
        : current,
    );
  }

  async function saveSettings() {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/automation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "settings", ...settings }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Failed to save Secretary settings.");
      setSettings({ ...DEFAULT_SETTINGS, ...data });
      setNotice("ENGINE SETTINGS SAVED.");
    } catch (error: any) {
      setNotice(error?.message || "Failed to save engine settings.");
    } finally {
      setBusy(false);
    }
  }

  async function saveFlow() {
    if (!selected) return;

    const name = selected.name.trim();
    const responseText = selected.responseText.trim();

    if (!name || !responseText) {
      setNotice("STEP NAME AND MESSAGE CONTENT ARE REQUIRED.");
      return;
    }

    const badTarget = selected.buttons.find(
      (button) =>
        button.action === "flow" &&
        (!button.targetFlowId || button.targetFlowId === selected.id),
    );
    if (badTarget) {
      setNotice("SELECT A DIFFERENT TARGET STEP FOR " + badTarget.text.toUpperCase() + ".");
      return;
    }

    const badCallback = selected.buttons.find(
      (button) => callbackLength(selected.id || "new", button.id) > 64,
    );
    if (badCallback) {
      setNotice("CALLBACK DATA IS OVER 64 BYTES FOR " + badCallback.text.toUpperCase() + ".");
      return;
    }

    setBusy(true);
    setNotice("");

    try {
      const response = await fetch("/api/admin/automation", {
        method: selected.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...selected,
          name,
          responseText,
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
      if (!response.ok) throw new Error(data?.error || "Failed to save Secretary step.");

      const saved = normalizeFlow(data);
      setFlows((current) =>
        selected.id
          ? current.map((flow) => (flow.id === saved.id ? saved : flow))
          : [...current, saved],
      );
      setSelected(saved);
      setNotice("SECRETARY STEP SAVED.");
    } catch (error: any) {
      setNotice(error?.message || "Failed to save Secretary step.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteFlow() {
    if (!selected?.id) return;
    if (!window.confirm("DELETE SECRETARY STEP \"" + selected.name + "\"?")) return;

    setBusy(true);
    try {
      const response = await fetch(
        "/api/admin/automation?id=" + encodeURIComponent(selected.id),
        { method: "DELETE" },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Delete failed.");

      setFlows((current) => current.filter((flow) => flow.id !== selected.id));
      if (settings.welcomeFlowId === selected.id) {
        setSettings((current) => ({ ...current, welcomeFlowId: "" }));
      }
      setSelected(null);
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
      if (!response.ok) throw new Error(data?.error || "Failed to update chat.");

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
    ? flows.find((flow) =>
        flow.buttons.some((button) => button.targetFlowId === selected.id),
      ) || null
    : null;

  return (
    <div className="w-full text-slate-900 space-y-1.5">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-1">
        <div className="min-w-0">
          <div className="text-[8px] font-mono uppercase tracking-[0.18em] text-slate-400">
            Telegram Business Secretary
          </div>
          <h1 className="text-base font-heading font-black uppercase tracking-tight">
            Inline Button Configurator
          </h1>
          <p className="text-[8px] text-slate-500">
            Build a linked hierarchy where button clicks edit the existing Telegram message bubble.
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="h-7 px-2 border border-slate-200 text-[8px] font-bold uppercase flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" /> Reload
          </button>
          <button
            type="button"
            onClick={() => {
              setSelected(newFlow());
              setExpandedButton("");
              setNotice("");
            }}
            className="h-7 px-2.5 bg-slate-900 text-white text-[8px] font-bold uppercase flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> New Step
          </button>
        </div>
      </div>

      {notice && (
        <div className="border border-slate-200 bg-slate-50 px-2 py-1 text-[8px] font-mono uppercase">
          {notice}
        </div>
      )}

      <div className="grid lg:grid-cols-[225px_minmax(0,1fr)_260px] border border-slate-200 bg-white">
        <aside className="min-w-0 border-b lg:border-b-0 lg:border-r border-slate-200">
          <div className="px-2 py-1.5 border-b border-slate-200 flex items-center justify-between">
            <div>
              <div className="text-[8px] font-mono uppercase tracking-widest text-slate-400">Flow tree</div>
              <div className="text-[10px] font-black uppercase">Steps</div>
            </div>
            <GitBranch className="w-3.5 h-3.5 text-slate-400" />
          </div>

          {loading ? (
            <div className="p-2 text-[8px] font-mono text-slate-400">LOADING...</div>
          ) : flows.length === 0 ? (
            <div className="p-2 text-[8px] text-slate-400">NO STEPS YET.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {flows.map((flow) => {
                const inbound = flows.reduce(
                  (count, item) =>
                    count + item.buttons.filter((button) => button.targetFlowId === flow.id).length,
                  0,
                );
                const outbound = flow.buttons.filter((button) => button.targetFlowId).length;

                return (
                  <button
                    type="button"
                    key={flow.id}
                    onClick={() => {
                      setSelected(flow);
                      setExpandedButton("");
                      setNotice("");
                    }}
                    className={`w-full text-left px-2 py-1.5 border-l-2 ${
                      selected?.id === flow.id
                        ? "border-l-slate-900 bg-slate-50"
                        : "border-l-transparent hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 ${flow.active ? "bg-emerald-500" : "bg-slate-300"}`} />
                      <span className="text-[10px] font-bold truncate flex-1">{flow.name}</span>
                      {settings.welcomeFlowId === flow.id && (
                        <span className="text-[7px] bg-slate-900 text-white px-1">WELCOME</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[7px] font-mono text-slate-400">
                      IN {inbound} · OUT {outbound} · {flow.id}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <main className="min-w-0 border-b lg:border-b-0 lg:border-r border-slate-200">
          {!selected ? (
            <div className="min-h-[220px] flex items-center justify-center p-2 text-center">
              <div>
                <MessageSquare className="w-7 h-7 mx-auto text-slate-300 mb-1" />
                <div className="text-[10px] font-bold uppercase">Select a step</div>
                <div className="text-[8px] text-slate-400">Or create the first step.</div>
              </div>
            </div>
          ) : (
            <div>
              <div className="px-2 py-1.5 border-b border-slate-200 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[8px] font-mono uppercase tracking-widest text-slate-400">Step editor</div>
                  <div className="text-[10px] font-bold truncate">{selected.name}</div>
                </div>
                <div className="flex items-center gap-1">
                  <label className="h-7 px-1.5 border border-slate-200 flex items-center gap-1 text-[8px] uppercase font-bold">
                    <input
                      type="checkbox"
                      checked={selected.active}
                      onChange={(event) => updateSelected({ active: event.target.checked })}
                    />
                    Active
                  </label>
                  <button
                    type="button"
                    onClick={() => void deleteFlow()}
                    disabled={!selected.id || busy}
                    className="h-7 px-2 border border-red-200 text-red-600 text-[8px] font-bold uppercase flex items-center gap-1 disabled:opacity-40"
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
              </div>

              <div className="p-2 space-y-1.5">
                <div className="grid sm:grid-cols-[1.2fr_.8fr] gap-1.5">
                  <label>
                    <span className="label-mini">Step name</span>
                    <input
                      value={selected.name}
                      onChange={(event) => updateSelected({ name: event.target.value })}
                      className="control-mini"
                      placeholder="WELCOME / PRODUCTS / PAYMENT"
                    />
                  </label>
                  <label>
                    <span className="label-mini">Priority</span>
                    <input
                      type="number"
                      value={selected.priority}
                      onChange={(event) =>
                        updateSelected({ priority: Number(event.target.value) || 100 })
                      }
                      className="control-mini"
                    />
                  </label>
                </div>

                <div className="grid sm:grid-cols-[120px_minmax(0,1fr)_110px] gap-1.5">
                  <label>
                    <span className="label-mini">Trigger</span>
                    <select
                      value={selected.triggerType}
                      onChange={(event) =>
                        updateSelected({ triggerType: event.target.value as Flow["triggerType"] })
                      }
                      className="control-mini"
                    >
                      <option value="message">Message</option>
                      <option value="callback">Callback</option>
                    </select>
                  </label>
                  <label>
                    <span className="label-mini">Trigger value</span>
                    <input
                      value={selected.triggerValue}
                      onChange={(event) => updateSelected({ triggerValue: event.target.value })}
                      className="control-mini"
                      placeholder="Optional for welcome"
                    />
                  </label>
                  <label>
                    <span className="label-mini">Match</span>
                    <select
                      value={selected.matchMode}
                      onChange={(event) =>
                        updateSelected({ matchMode: event.target.value as Flow["matchMode"] })
                      }
                      className="control-mini"
                    >
                      <option value="contains">Contains</option>
                      <option value="exact">Exact</option>
                      <option value="starts_with">Starts</option>
                    </select>
                  </label>
                </div>

                <label>
                  <span className="label-mini">Message bubble content</span>
                  <textarea
                    value={selected.responseText}
                    onChange={(event) => updateSelected({ responseText: event.target.value })}
                    className="w-full min-h-[72px] border border-slate-200 px-2 py-1.5 text-[9px] outline-none resize-y focus:border-slate-900"
                    placeholder="Hi {{name}}, welcome to PRIME."
                  />
                  <span className="text-[7px] text-slate-400 font-mono">
                    {{name}} · {{username}} · {{user_id}} · {selected.responseText.length}/4096
                  </span>
                </label>

                <div className="border-t border-slate-200">
                  <div className="flex items-center justify-between gap-2 py-1.5">
                    <div>
                      <div className="text-[8px] font-mono uppercase tracking-widest text-slate-400">Inline keyboard</div>
                      <div className="text-[8px] text-slate-500">Buttons stay on this bubble; GO TO STEP swaps in the target step.</div>
                    </div>
                    <button
                      type="button"
                      onClick={addButton}
                      className="h-7 px-2 border border-slate-200 text-[8px] font-bold uppercase flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  </div>

                  <div className="border-t border-slate-200 divide-y divide-slate-200">
                    {selected.buttons.length === 0 ? (
                      <div className="p-2 text-[8px] text-slate-400">NO BUTTONS.</div>
                    ) : (
                      selected.buttons.map((button, index) => {
                        const open = expandedButton === button.id;
                        const bytes = callbackLength(selected.id || "new", button.id);

                        return (
                          <div key={button.id} className="p-1.5 bg-white">
                            <div className="grid grid-cols-[22px_minmax(0,1fr)_120px_26px] gap-1.5 items-center">
                              <span className="text-[7px] font-mono text-slate-400 text-center">#{index + 1}</span>
                              <input
                                value={button.text}
                                onChange={(event) => updateButton(index, { text: event.target.value })}
                                className="control-mini"
                                placeholder="Button label"
                              />
                              <select
                                value={button.action}
                                onChange={(event) =>
                                  updateButton(index, {
                                    action: event.target.value as ButtonAction,
                                  })
                                }
                                className="control-mini"
                              >
                                {ACTIONS.map((item) => (
                                  <option value={item.value} key={item.value}>
                                    {item.label}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => setExpandedButton(open ? "" : button.id)}
                                className="h-7 w-7 border border-slate-200 flex items-center justify-center"
                                title="Expand"
                              >
                                <ChevronRight className={`w-3 h-3 ${open ? "rotate-90" : ""}`} />
                              </button>
                            </div>

                            {open && (
                              <div className="pt-1.5 grid gap-1.5">
                                {button.action === "flow" && (
                                  <label>
                                    <span className="label-mini">Target step</span>
                                    <select
                                      value={button.targetFlowId}
                                      onChange={(event) =>
                                        updateButton(index, { targetFlowId: event.target.value })
                                      }
                                      className="control-mini"
                                    >
                                      <option value="">Select next step</option>
                                      {flows
                                        .filter((flow) => flow.id !== selected.id)
                                        .map((flow) => (
                                          <option value={flow.id} key={flow.id}>
                                            {flow.name}
                                          </option>
                                        ))}
                                    </select>
                                  </label>
                                )}

                                {button.action === "reply" && (
                                  <label>
                                    <span className="label-mini">In-place response</span>
                                    <textarea
                                      value={button.response}
                                      onChange={(event) =>
                                        updateButton(index, { response: event.target.value })
                                      }
                                      className="w-full min-h-[54px] border border-slate-200 px-2 py-1.5 text-[9px] outline-none focus:border-slate-900"
                                      placeholder="Message shown after click."
                                    />
                                  </label>
                                )}

                                {button.action === "url" && (
                                  <label>
                                    <span className="label-mini">Destination URL</span>
                                    <input
                                      value={button.url}
                                      onChange={(event) =>
                                        updateButton(index, { url: event.target.value })
                                      }
                                      className="control-mini"
                                      placeholder="https://..."
                                    />
                                  </label>
                                )}

                                {button.action === "media" && (
                                  <div className="grid sm:grid-cols-[105px_minmax(0,1fr)] gap-1.5">
                                    <label>
                                      <span className="label-mini">Media type</span>
                                      <select
                                        value={button.mediaType}
                                        onChange={(event) =>
                                          updateButton(index, { mediaType: event.target.value })
                                        }
                                        className="control-mini"
                                      >
                                        <option value="photo">Photo</option>
                                        <option value="video">Video</option>
                                        <option value="document">Document</option>
                                      </select>
                                    </label>
                                    <label>
                                      <span className="label-mini">Media URL / file_id</span>
                                      <input
                                        value={button.mediaUrl}
                                        onChange={(event) =>
                                          updateButton(index, { mediaUrl: event.target.value })
                                        }
                                        className="control-mini"
                                        placeholder="HTTPS URL or Telegram file_id"
                                      />
                                    </label>
                                  </div>
                                )}

                                {button.action === "caption" && (
                                  <label>
                                    <span className="label-mini">Caption</span>
                                    <textarea
                                      value={button.caption}
                                      onChange={(event) =>
                                        updateButton(index, { caption: event.target.value })
                                      }
                                      className="w-full min-h-[54px] border border-slate-200 px-2 py-1.5 text-[9px] outline-none focus:border-slate-900"
                                    />
                                  </label>
                                )}

                                {button.action === "markup" && (
                                  <label>
                                    <span className="label-mini">Reply markup JSON</span>
                                    <textarea
                                      value={button.replyMarkup ? JSON.stringify(button.replyMarkup) : ""}
                                      onChange={(event) => {
                                        const value = event.target.value.trim();
                                        if (!value) {
                                          updateButton(index, { replyMarkup: undefined });
                                          return;
                                        }
                                        try {
                                          updateButton(index, { replyMarkup: JSON.parse(value) });
                                        } catch {
                                          setNotice("REPLY MARKUP JSON IS INVALID.");
                                        }
                                      }}
                                      className="w-full min-h-[54px] border border-slate-200 px-2 py-1.5 text-[9px] font-mono outline-none focus:border-slate-900"
                                      placeholder='{"inline_keyboard":[[{"text":"Back","callback_data":"..."}]]}'
                                    />
                                  </label>
                                )}

                                <div className="flex items-center justify-between gap-2">
                                  <span className={`text-[7px] font-mono ${
                                    bytes > 64 ? "text-red-600 font-bold" : "text-slate-400"
                                  }`}>
                                    CALLBACK {bytes}/64 · {button.action.toUpperCase()}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => removeButton(index)}
                                    className="h-6 px-1.5 border border-red-200 text-red-600 text-[7px] font-bold uppercase flex items-center gap-1"
                                  >
                                    <Trash2 className="w-3 h-3" /> Remove
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

                <div className="border-t border-slate-200 pt-1.5 flex items-center justify-between gap-2">
                  <div className="text-[7px] font-mono text-slate-400">
                    {parent ? (
                      <span className="inline-flex items-center gap-1">
                        FROM {parent.name}<ArrowRight className="w-2.5 h-2.5" />{selected.name}
                      </span>
                    ) : (
                      "ROOT STEP"
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void saveFlow()}
                    disabled={busy}
                    className="h-7 px-2.5 bg-slate-900 text-white text-[8px] font-bold uppercase tracking-widest flex items-center gap-1 disabled:opacity-50"
                  >
                    {busy ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    Save Step
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>

        <section className="min-w-0 bg-slate-50">
          <div className="px-2 py-1.5 border-b border-slate-200">
            <div className="text-[8px] font-mono uppercase tracking-widest text-slate-400">Preview</div>
            <div className="text-[10px] font-black uppercase">One bubble</div>
          </div>

          <div className="p-1.5 space-y-1.5">
            <div className="border border-slate-200 bg-white p-1.5">
              <div className="text-[7px] font-mono uppercase tracking-widest text-slate-400 mb-1">PATH</div>
              <div className="flex items-center flex-wrap gap-1 text-[8px] font-mono">
                {parent && (
                  <>
                    <span className="border border-slate-200 px-1 py-0.5">{parent.name}</span>
                    <ArrowRight className="w-2.5 h-2.5 text-slate-300" />
                  </>
                )}
                <span className="border border-slate-900 bg-slate-900 text-white px-1 py-0.5">
                  {selected?.name || "NONE"}
                </span>
              </div>
            </div>

            <div className="border border-slate-300 bg-white p-1.5">
              <div className="flex items-center gap-1 mb-1">
                <MessageSquare className="w-3 h-3 text-slate-500" />
                <span className="text-[7px] font-mono uppercase tracking-widest text-slate-400">TELEGRAM BUBBLE</span>
              </div>
              <div className="bg-slate-950 text-white p-2">
                <div className="text-[9px] leading-snug whitespace-pre-wrap break-words">
                  {selected?.responseText || "Select a step to preview."}
                </div>
                {selected?.buttons.length ? (
                  <div className="mt-1.5 grid gap-0.5 border-t border-white/10 pt-1.5">
                    {selected.buttons.map((button) => (
                      <div
                        key={button.id}
                        className="border border-white/10 bg-white/5 px-1.5 py-1 text-[8px] flex items-center justify-between"
                      >
                        <span className="truncate">{button.text}</span>
                        <span className="font-mono text-[7px] text-slate-400">{button.action}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-1.5 text-[7px] text-slate-500">NO INLINE BUTTONS</div>
                )}
              </div>
            </div>

            <div className="border border-slate-200 bg-white">
              <div className="px-1.5 py-1 border-b border-slate-200 text-[7px] font-bold uppercase tracking-widest">
                Engine
              </div>
              <div className="p-1.5 text-[8px] font-mono space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">STATUS</span>
                  <span className={settings.enabled ? "text-emerald-700 font-bold" : "text-slate-400"}>
                    {settings.enabled ? "ENABLED" : "DISABLED"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">WELCOME</span>
                  <span className="truncate">
                    {flows.find((flow) => flow.id === settings.welcomeFlowId)?.name || "NOT SET"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">COOLDOWN</span>
                  <span>24H INACTIVITY</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="grid lg:grid-cols-[1fr_1fr] border border-slate-200 bg-white">
        <section className="min-w-0 border-b lg:border-b-0 lg:border-r border-slate-200">
          <div className="px-2 py-1.5 border-b border-slate-200">
            <div className="text-[8px] font-mono uppercase tracking-widest text-slate-400">Engine settings</div>
            <div className="text-[10px] font-black uppercase">Welcome + cooldown</div>
          </div>
          <div className="p-1.5 space-y-1.5">
            <div className="grid sm:grid-cols-3 gap-1.5">
              <label>
                <span className="label-mini">Business user</span>
                <input readOnly value={settings.businessUserId || "Not connected"} className="control-mini bg-slate-50" />
              </label>
              <label>
                <span className="label-mini">Connection</span>
                <input readOnly value={settings.businessConnectionId || "Not connected"} className="control-mini bg-slate-50" />
              </label>
              <label>
                <span className="label-mini">Business chat</span>
                <input readOnly value={settings.businessUserChatId || "Not connected"} className="control-mini bg-slate-50" />
              </label>
            </div>

            <div className="grid sm:grid-cols-[1fr_auto_auto] gap-1.5 items-end">
              <label>
                <span className="label-mini">Welcome step</span>
                <select
                  value={settings.welcomeFlowId}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, welcomeFlowId: event.target.value }))
                  }
                  className="control-mini"
                >
                  <option value="">Select welcome</option>
                  {flows.filter((flow) => flow.active).map((flow) => (
                    <option value={flow.id} key={flow.id}>
                      {flow.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="h-7 border border-slate-200 px-1.5 flex items-center gap-1 text-[8px] font-mono">
                <span className="font-bold">24H</span>
                <span className="text-slate-400">after last customer message</span>
              </div>

              <button
                type="button"
                onClick={() => setSettings((current) => ({ ...current, enabled: !current.enabled }))}
                className={`h-7 px-2 border text-[8px] font-bold uppercase flex items-center gap-1 ${
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
              <label>
                <span className="label-mini">Fallback response</span>
                <input
                  value={settings.fallbackResponse}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, fallbackResponse: event.target.value }))
                  }
                  className="control-mini"
                  placeholder="Optional fallback"
                />
              </label>
              <label className="h-7 px-1.5 border border-slate-200 flex items-center gap-1 text-[8px] uppercase font-bold">
                <input
                  type="checkbox"
                  checked={settings.fallbackEnabled}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      fallbackEnabled: event.target.checked,
                    }))
                  }
                />
                Fallback
              </label>
            </div>

            <button
              type="button"
              onClick={() => void saveSettings()}
              disabled={busy}
              className="h-7 px-2.5 bg-slate-900 text-white text-[8px] font-bold uppercase tracking-widest flex items-center gap-1 disabled:opacity-50"
            >
              <Save className="w-3 h-3" /> Save Engine
            </button>
          </div>
        </section>

        <section className="min-w-0">
          <div className="px-2 py-1.5 border-b border-slate-200">
            <div className="text-[8px] font-mono uppercase tracking-widest text-slate-400">Live control</div>
            <div className="text-[10px] font-black uppercase">Per-chat pause</div>
          </div>
          <div className="p-1.5">
            {chats.length === 0 ? (
              <div className="text-[8px] text-slate-400">NO CHATS YET.</div>
            ) : (
              <div className="divide-y divide-slate-200 border border-slate-200">
                {chats.map((chat) => (
                  <div
                    key={chat.business_connection_id + ":" + chat.chat_id}
                    className="px-1.5 py-1 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 font-mono">
                      <div className="text-[9px] font-bold truncate">CHAT {chat.chat_id}</div>
                      <div className="text-[7px] text-slate-400 truncate">
                        LAST CUSTOMER:{" "}
                        {chat.last_customer_message_at
                          ? new Date(chat.last_customer_message_at).toLocaleString()
                          : "—"}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span
                        className={`px-1 py-0.5 text-[7px] font-bold uppercase ${
                          chat.bot_paused
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {chat.bot_paused ? "PAUSED" : "ACTIVE"}
                      </span>
                      <button
                        type="button"
                        onClick={() => void toggleChat(chat)}
                        className="h-6 px-1.5 border border-slate-200 text-[7px] font-bold uppercase"
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

      <div className="text-[7px] font-mono text-slate-400">
        Callback namespace: <span className="text-slate-600">sec:FLOW_ID:BUTTON_ID</span> · Telegram limit: 64 bytes.
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
          height: 28px;
          border: 1px solid #e2e8f0;
          padding: 0 6px;
          border-radius: 0;
          outline: 0;
          background: #fff;
          font-size: 9px;
          color: #0f172a;
        }
        .control-mini:focus {
          border-color: #0f172a;
        }
      `}</style>
    </div>
  );
}
