import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { customers } from '../schema.js';
import { scanReceipt } from '../lib/receipt-ocr.js';
export default async function(input,ctx){
 const id=String(ctx?.initData?.user?.id||'');
 if(!/^\d+$/.test(id))throw new EndpointError('Verified Telegram access required.',{code:'AUTH_REQUIRED'});
 const customer=await db.select({id:customers.id,isBanned:customers.isBanned}).from(customers).where(eq(customers.tgUserId,id)).get();
 if(!customer||customer.isBanned)throw new EndpointError('Customer account required.',{code:'AUTH_REQUIRED'});
 return await scanReceipt(String(input?.data||''),String(input?.contentType||'image/jpeg'),customer.id);
}
