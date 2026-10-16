import {
  answerSecretaryCallback,
  buildSecretaryAction,
  executeSecretaryAction,
  findButton,
  getAutomationFlows,
  keyboard,
  parseSecretaryCallback,
  renderTemplate,
} from '../lib/telegram-automation.js';

export default async function (callback) {
  const data = String(callback?.data || '');
  // Always close Telegram's loading indicator first, including ignored callbacks.
  await answerSecretaryCallback(callback.id);

  const message = callback.message;
  if (!message) return;
  const secretary = parseSecretaryCallback(data);
  const legacy = data.startsWith('auto:');
  if (!secretary && !legacy) return;

  const connectionId = callback.business_connection_id;
  if (!connectionId) return;

  let flowId = '';
  let buttonId = '';
  let parsedType = 'text';
  if (secretary) {
    flowId = secretary.flowId;
    buttonId = secretary.buttonId;
    parsedType = secretary.type;
  } else {
    const parts = data.split(':');
    flowId = parts[1] || '';
    buttonId = parts.slice(2).join(':');
  }

  const flows = await getAutomationFlows();
  const flow = flows.find((item) => item.id === flowId && item.active);
  const button = findButton(flow, buttonId);
  if (!flow || !button) return;

  const configuredAction = String(button.action || '').toLowerCase();
  const effectiveAction = parsedType === 'auto'
    ? (['flow', 'reply', 'media', 'caption', 'markup'].includes(configuredAction) ? configuredAction : 'reply')
    : parsedType;

  const context = { callback, connectionId, message };
  if (effectiveAction === 'flow') {
    const targetId = String(button.targetFlowId || '').trim();
    const targetFlow = flows.find((item) => item.id === targetId && item.active);
    if (!targetFlow) return;
    await executeSecretaryAction(context, {
      type: 'text',
      text: renderTemplate(targetFlow.responseText || '', message),
      replyMarkup: keyboard(targetFlow),
    });
    return;
  }

  const actionType = ['media', 'caption', 'markup', 'text'].includes(effectiveAction)
    ? effectiveAction
    : 'text';
  const action = buildSecretaryAction(button, actionType, message, flow);
  await executeSecretaryAction(context, action);
}
