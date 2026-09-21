import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export type AutomationButton = {
  id: string;
  text: string;
  response: string;
  url?: string;
};

export type AutomationFlow = {
  id: string;
  name: string;
  active: boolean;
  triggerType: 'message' | 'callback';
  triggerValue: string;
  matchMode: 'exact' | 'contains' | 'starts_with';
  responseText: string;
  buttons: AutomationButton[];
  priority: number;
  createdAt?: string;
  updatedAt?: string;
};

function mapRow(row: any): AutomationFlow {
  return {
    id: row.id,
    name: row.name,
    active: row.active !== false,
    triggerType: row.trigger_type === 'callback' ? 'callback' : 'message',
    triggerValue: row.trigger_value || '',
    matchMode: ['exact', 'contains', 'starts_with'].includes(row.match_mode) ? row.match_mode : 'contains',
    responseText: row.response_text || '',
    buttons: Array.isArray(row.buttons) ? row.buttons : [],
    priority: Number(row.priority) || 100,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getAutomationSettings() {
  if (!isSupabaseConfigured()) return { enabled: false, fallbackEnabled: false, fallbackResponse: '' };
  const supabase = getSupabaseAdmin()!;
  const { data, error } = await supabase.from('telegram_automation_settings').select('*').eq('id', 'default').maybeSingle();
  if (error) throw error;
  return {
    enabled: data?.enabled === true,
    fallbackEnabled: data?.fallback_enabled === true,
    fallbackResponse: data?.fallback_response || '',
    businessConnectionId: data?.business_connection_id || '',
    businessUserId: data?.business_user_id ? String(data.business_user_id) : '',
    businessUserChatId: data?.business_user_chat_id ? String(data.business_user_chat_id) : '',
    welcomeFlowId: data?.welcome_flow_id || '',
  };
}

export async function updateAutomationSettings(input: any) {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured');
  const supabase = getSupabaseAdmin()!;
  const payload = {
    id: 'default',
    enabled: Boolean(input.enabled),
    fallback_enabled: Boolean(input.fallbackEnabled),
    fallback_response: String(input.fallbackResponse || ''),
    business_connection_id: String(input.businessConnectionId || '') || null,
    business_user_id: input.businessUserId ? Number(input.businessUserId) : null,
    business_user_chat_id: input.businessUserChatId ? Number(input.businessUserChatId) : null,
    welcome_flow_id: String(input.welcomeFlowId || '') || null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('telegram_automation_settings').upsert(payload).select().single();
  if (error) throw error;
  return { enabled: data.enabled, fallbackEnabled: data.fallback_enabled, fallbackResponse: data.fallback_response || '' };
}

export async function getAutomationFlows() {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdmin()!;
  const { data, error } = await supabase.from('telegram_automation_flows').select('*').order('priority', { ascending: true }).order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapRow);
}

export async function createAutomationFlow(input: any) {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured');
  const supabase = getSupabaseAdmin()!;
  const id = String(input.id || 'auto_' + Date.now());
  const payload = {
    id,
    name: String(input.name || 'Automation'),
    active: input.active !== false,
    trigger_type: input.triggerType === 'callback' ? 'callback' : 'message',
    trigger_value: String(input.triggerValue || '').trim(),
    match_mode: ['exact', 'contains', 'starts_with'].includes(input.matchMode) ? input.matchMode : 'contains',
    response_text: String(input.responseText || ''),
    buttons: Array.isArray(input.buttons) ? input.buttons : [],
    priority: Number.isFinite(Number(input.priority)) ? Number(input.priority) : 100,
  };
  const { data, error } = await supabase.from('telegram_automation_flows').insert(payload).select().single();
  if (error) throw error;
  return mapRow(data);
}

export async function updateAutomationFlow(id: string, input: any) {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured');
  const supabase = getSupabaseAdmin()!;
  const payload: Record<string, any> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) payload.name = String(input.name);
  if (input.active !== undefined) payload.active = Boolean(input.active);
  if (input.triggerType !== undefined) payload.trigger_type = input.triggerType === 'callback' ? 'callback' : 'message';
  if (input.triggerValue !== undefined) payload.trigger_value = String(input.triggerValue).trim();
  if (input.matchMode !== undefined) payload.match_mode = ['exact', 'contains', 'starts_with'].includes(input.matchMode) ? input.matchMode : 'contains';
  if (input.responseText !== undefined) payload.response_text = String(input.responseText);
  if (input.buttons !== undefined) payload.buttons = Array.isArray(input.buttons) ? input.buttons : [];
  if (input.priority !== undefined) payload.priority = Number(input.priority) || 100;
  const { data, error } = await supabase.from('telegram_automation_flows').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return mapRow(data);
}

export async function deleteAutomationFlow(id: string) {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured');
  const supabase = getSupabaseAdmin()!;
  const { error } = await supabase.from('telegram_automation_flows').delete().eq('id', id);
  if (error) throw error;
  return { success: true };
}

function matches(value: string, trigger: string, mode: string) {
  const source = value.trim().toLowerCase();
  const target = trigger.trim().toLowerCase();
  if (!target) return false;
  if (mode === 'exact') return source === target;
  if (mode === 'starts_with') return source.startsWith(target);
  return source.includes(target);
}

export async function findAutomationResponse(triggerType: 'message' | 'callback', value: string) {
  const settings = await getAutomationSettings();
  if (!settings.enabled) return null;
  const flows = await getAutomationFlows();
  const flow = flows.find(item => item.active && item.triggerType === triggerType && matches(value, item.triggerValue, item.matchMode));
  if (flow) return { flow, settings };
  if (triggerType === 'message' && settings.fallbackEnabled && settings.fallbackResponse) {
    return { flow: null, settings };
  }
  return null;
}


export async function saveBusinessConnection(connection: any) {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured');
  const supabase = getSupabaseAdmin()!;
  const { error } = await supabase.from('telegram_automation_settings').upsert({
    id: 'default',
    business_connection_id: connection?.id || null,
    business_user_id: connection?.user?.id ? Number(connection.user.id) : null,
    business_user_chat_id: connection?.user_chat_id ? Number(connection.user_chat_id) : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) throw error;
}

export async function getAutomationChatState(connectionId: string, chatId: number) {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseAdmin()!;
  const { data, error } = await supabase.from('telegram_automation_chats')
    .select('*').eq('business_connection_id', connectionId).eq('chat_id', chatId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function recordCustomerMessage(connectionId: string, chatId: number, now: Date) {
  if (!isSupabaseConfigured()) return;
  const supabase = getSupabaseAdmin()!;
  const { error } = await supabase.from('telegram_automation_chats').upsert({
    business_connection_id: connectionId, chat_id: chatId,
    last_customer_message_at: now.toISOString(), updated_at: now.toISOString()
  }, { onConflict: 'business_connection_id,chat_id' });
  if (error) throw error;
}

export async function recordHumanTakeover(connectionId: string, chatId: number, now: Date) {
  if (!isSupabaseConfigured()) return;
  const until = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const supabase = getSupabaseAdmin()!;
  const { error } = await supabase.from('telegram_automation_chats').upsert({
    business_connection_id: connectionId, chat_id: chatId,
    last_human_message_at: now.toISOString(), human_takeover_until: until.toISOString(),
    updated_at: now.toISOString()
  }, { onConflict: 'business_connection_id,chat_id' });
  if (error) throw error;
}

export async function recordBotMessage(connectionId: string, chatId: number, now: Date) {
  if (!isSupabaseConfigured()) return;
  const supabase = getSupabaseAdmin()!;
  const { error } = await supabase.from('telegram_automation_chats').upsert({
    business_connection_id: connectionId, chat_id: chatId,
    last_bot_message_at: now.toISOString(), updated_at: now.toISOString()
  }, { onConflict: 'business_connection_id,chat_id' });
  if (error) throw error;
}

export function shouldStartAutomation(state: any, now: Date) {
  if (!state?.last_customer_message_at) return true;
  const lastCustomer = new Date(state.last_customer_message_at).getTime();
  if (now.getTime() - lastCustomer >= 24 * 60 * 60 * 1000) {
    if (!state.human_takeover_until) return true;
    return now.getTime() >= new Date(state.human_takeover_until).getTime();
  }
  return false;
}


export async function findWelcomeResponse() {
  const settings = await getAutomationSettings();
  if (!settings.enabled || !settings.welcomeFlowId) return null;
  const flows = await getAutomationFlows();
  const flow = flows.find(item => item.id === settings.welcomeFlowId && item.active);
  if (!flow || !flow.responseText) return null;
  return { flow, settings };
}
