import { EndpointError } from 'sdk';
import { handleSupport } from '../lib/support.js';
export default async function(input,ctx) {
  const actor=ctx?.initData?.user;
  if(!actor||!/^\d+$/.test(String(actor.id)))throw new EndpointError('Verified Telegram access is required.',{code:'AUTH_REQUIRED'});
  return handleSupport(input||{},actor,false);
}
