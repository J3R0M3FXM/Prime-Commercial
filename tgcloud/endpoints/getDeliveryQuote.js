import { EndpointError } from 'sdk';
import { saveDeliveryQuote } from '../lib/delivery-quotes.js';
import { quoteDelivery } from '../lib/delivery.js';

export default async function (input, ctx) {
  if (input?.destinationLat == null || input?.destinationLon == null) {
    throw new EndpointError('A valid destination is required.', { code: 'INVALID_INPUT' });
  }
  // The checkout needs all active options before the customer can select one.
  // quoteDelivery also accepts an optional courierId for a selected-courier refresh.
  const quote = await quoteDelivery(input.destinationLat, input.destinationLon, input.courierId || '');
  return await saveDeliveryQuote(quote, input.destinationLat, input.destinationLon, ctx?.initData?.user?.id);
}
