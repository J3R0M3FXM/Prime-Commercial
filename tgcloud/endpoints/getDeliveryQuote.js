import { EndpointError } from 'sdk';
import { quoteDelivery } from '../lib/delivery.js';

export default async function (input) {
  if (input?.destinationLat == null || input?.destinationLon == null) {
    throw new EndpointError('A valid destination is required.', { code: 'INVALID_INPUT' });
  }
  // The checkout needs all active options before the customer can select one.
  // quoteDelivery also accepts an optional courierId for a selected-courier refresh.
  return await quoteDelivery(input.destinationLat, input.destinationLon, input.courierId || '');
}
