import { EndpointError } from 'sdk';
import { requireAdmin } from '../lib/auth.js';
import {
  createAutomationFlow,
  deleteAutomationFlow,
  getAutomationChats,
  getAutomationFlows,
  getAutomationSettings,
  setAutomationChatPaused,
  updateAutomationFlow,
  updateAutomationSettings,
} from '../lib/telegram-automation.js';

export default async function (input, ctx) {
  await requireAdmin(ctx);
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new EndpointError('Invalid automation request.', { code: 'INVALID_INPUT' });
  }

  let action = input.action;
  if (!action && input.type === 'settings') action = 'settings';
  if (!action && input.type === 'chat_pause') action = 'pauseChat';
  if (!action && input.type === 'delete') action = 'delete';
  if (!action) action = input.id ? 'update' : 'create';

  if (action === 'list' || action === 'get') {
    const [settings, flows, chats] = await Promise.all([
      getAutomationSettings(),
      getAutomationFlows(),
      getAutomationChats(),
    ]);
    return { settings, flows, chats };
  }

  if (action === 'settings') return await updateAutomationSettings(input);

  if (action === 'pauseChat') {
    const connectionId = String(input.businessConnectionId || '').trim();
    const chatId = Number(input.chatId);
    if (!connectionId || !Number.isSafeInteger(chatId)) {
      throw new EndpointError('Business connection and valid chat ID are required.', { code: 'INVALID_INPUT' });
    }
    if (typeof input.paused !== 'boolean') throw new EndpointError('paused must be a boolean.', { code: 'INVALID_INPUT' });
    return await setAutomationChatPaused(connectionId, chatId, input.paused);
  }

  if (action === 'create') return await createAutomationFlow(input);

  if (action === 'update') {
    const id = String(input.id || '').trim();
    if (!id) throw new EndpointError('Automation ID is required.', { code: 'INVALID_INPUT' });
    const { id: ignoredId, type: ignoredType, action: ignoredAction, ...updates } = input;
    return await updateAutomationFlow(id, updates);
  }

  if (action === 'delete') {
    const id = String(input.id || '').trim();
    if (!id) throw new EndpointError('Automation ID is required.', { code: 'INVALID_INPUT' });
    return await deleteAutomationFlow(id);
  }

  throw new EndpointError('Unsupported automation action.', { code: 'INVALID_ACTION' });
}
