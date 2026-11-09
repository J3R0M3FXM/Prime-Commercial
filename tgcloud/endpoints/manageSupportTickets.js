import { requireAdmin } from '../lib/auth.js';
import { handleSupport } from '../lib/support.js';
export default async function(input,ctx) {return handleSupport(input||{},await requireAdmin(ctx),true);}
