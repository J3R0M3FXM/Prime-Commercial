const escapeHtml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function customerNotificationKind(order) {
  const status = String(order.status || '').toLowerCase();
  const control = String(order.controlState || '').toLowerCase();
  if (['completed', 'delivered'].includes(status)) return 'completed';
  if (['cancelled', 'canceled', 'expired'].includes(status)) {
    if (/second receipt|replacement receipt.*fail/i.test(String(order.reviewStatus || ''))) return 'cancelled-invalid';
    return status === 'expired' || order.cancellationReason === 'non-payment' || /deadline expired/i.test(String(order.reviewStatus || '')) ? 'cancelled-nonpayment' : 'cancelled-voluntary';
  }
  if (['held', 'hold'].includes(control) || status === 'held') {
    // The one-hour promise is sent only when staff have actually requested a replacement.
    return order.resubmitExpiresAt ? 'hold' : null;
  }
  if (control === 'failed' || String(order.paymentStatus || '').toLowerCase() === 'failed') return null;
  if (status === 'dispatched') return 'dispatched';
  if (['ready', 'packed'].includes(status)) return 'ready';
  if (['confirmed', 'confirm', 'approved', 'processing'].includes(status)) return String(order.paymentStatus || '').toLowerCase() === 'paid' ? status === 'processing' ? 'processing' : 'confirmed' : null;
  return status === 'pending' ? 'pending' : null;
}

export function customerNotificationContent(order, kind = customerNotificationKind(order)) {
  if (!kind) return null;
  const number = escapeHtml(order.orderNumber);
  const thanks = 'Thank you for choosing PRIME™ Core!';
  const bodies = {
    pending: [
      `We have received your order #${number}, and it is now pending review.`,
      'We will send you another notification once the review has been completed and your payment has been validated.', thanks,
    ],
    confirmed: [
      `We are pleased to inform you that your payment for order #${number} has been successfully verified and confirmed.`,
      'Your order is now being prepared for processing. We will send you another notification once there is an update on its status.', thanks,
    ],
    ready: [
      `We are pleased to inform you that your order #${number} is now ready for dispatch.`,
      'Your order is currently awaiting pickup by our assigned courier. We will send you another notification once the courier has collected your package and it is on its way for delivery.', thanks,
    ],
    dispatched: [
      `We are pleased to inform you that your order #${number} has been picked-up by our assigned courier and is now on its way to your delivery address.`,
      'You can track its current location thru the TRACK DELIVERY button below or by opening the Order Details in the PRIME™ Shopfront App.',
      'Once you have received your order, please confirm its receipt through the PRIME™ Storefront App to officially mark your order as completed.',
      'Important Reminder: If you do not manually confirm receipt, your order will be automatically marked as completed 6 hours after dispatch.', thanks,
    ],
    completed: [
      `We are pleased to inform you that your order #${number} has been successfully completed.`,
      'Any eligible Purchasing Points, Cashback Rewards, or other applicable bonuses earned from this transaction will be calculated and credited to your account within 24 hours of order completion.',
      'You may view your accumulated points, rewards, and available Store Credits through the PRIME™ Storefront App.',
      thanks + ' We appreciate your continued trust and support and look forward to serving you again!',
    ],
    hold: [
      `We regret to inform you that the receipt submitted for your order #${number} did not pass our payment validation process.`,
      'To proceed with your order, please resubmit a new and valid proof of payment for verification.',
      'You may upload your updated payment receipt by navigating to the Order History section of the PRIME™ Storefront App or by clicking the corresponding button below.',
      'Important Reminder: You must resubmit your proof of payment within 1 hour of receiving this notification. Otherwise, your order will be automatically cancelled.',
      order.resubmitExpiresAt ? `Receipt Deadline: ${escapeHtml(new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(Number(order.resubmitExpiresAt))))} (Asia/Manila). The existing deadline does not restart if this message arrives late.` : '',
      'We appreciate your prompt attention to this matter.', thanks,
    ],
    'cancelled-nonpayment': [
      `We regret to inform you that your order #${number} has been automatically cancelled because a new and valid proof of payment was not submitted within the required 1-hour period.`,
      'All items reserved for your order have been released back into our available inventory and are no longer reserved under your account.',
      'If you still wish to purchase these items, please place a new order through the PRIME™ Storefront App, subject to current stock availability and pricing.',
      'We apologize for any inconvenience this may have caused and appreciate your understanding.', thanks,
    ],
    'cancelled-voluntary': [
      `We would like to inform you that your order #${number} has been successfully cancelled, as requested.`,
      'All items previously reserved for your order have been released back into our available inventory.',
      'If payment has already been made and successfully verified, the eligible refund amount will be processed and credited to your account in the form of Store Credits, which you may use as good as cash toward your next purchase through the PRIME™ Storefront App.',
      'You may check your available Store Credits under the Points &amp; Credits section of the app once the refund has been processed.',
      'We appreciate your understanding and look forward to serving you again.', thanks,
    ],
  };
  bodies.processing = bodies.confirmed;
  bodies['cancelled-invalid'] = [
    `We regret to inform you that your order #${number} has been automatically cancelled because the replacement receipt did not pass payment validation.`,
    ...bodies['cancelled-nonpayment'].slice(1),
  ];
  if (!bodies[kind]) return null;
  return {
    kind, text: ['Greetings from PRIME™ Core!', ...bodies[kind]].filter(Boolean).join('\n\n'),
    buttonLabel: kind === 'completed' ? 'VIEW REWARDS & POINTS' : kind === 'dispatched' ? 'TRACK DELIVERY' : kind === 'hold' ? 'RE-UPLOAD RECEIPT' : 'VIEW ORDER DETAILS',
  };
}

export function customerNotificationKeyboard(username, orderNumber, label, trackingUrl = '') {
  const link = prefix => 'https://t.me/' + username + '?startapp=' + encodeURIComponent(prefix + String(orderNumber));
  const details = { text: 'VIEW ORDER DETAILS', url: link('order_') };
  if (label === 'VIEW REWARDS & POINTS') return { inline_keyboard: [[{ text: label, url: 'https://t.me/' + username + '?startapp=rewards' }]] };
  if (label === 'RE-UPLOAD RECEIPT') return { inline_keyboard: [[{ text: label, url: link('receipt_') }, details]] };
  if (label === 'TRACK DELIVERY') {
    const safe = /^https:\/\/[^\s/@]+(?:[/?#][^\s]*)?$/i.test(trackingUrl) && !/[\\\u0000-\u0020]/.test(trackingUrl);
    return { inline_keyboard: [[{ text: label, url: safe ? trackingUrl : link('order_') }, details]] };
  }
  return { inline_keyboard: [[details]] };
}
