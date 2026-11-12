import { db, EndpointError } from 'sdk';
import { requireAdmin } from '../lib/auth.js';
import { ensureFaqs,listFaqs,sanitizeFaqHtml } from '../lib/support-faqs.js';
export default async function(input,ctx) {
  await requireAdmin(ctx);await ensureFaqs();
  const action=String(input?.action||'list');if(action==='list')return listFaqs();
  const id=String(input?.id||'');if(!/^[a-zA-Z0-9_-]{8,100}$/.test(id))throw new EndpointError('Invalid FAQ ID.',{code:'INVALID_INPUT'});
  if(action==='delete'){await db.run('DELETE FROM support_faqs WHERE id=:id',{':id':id});return {success:true};}
  if(!['create','update'].includes(action))throw new EndpointError('Invalid FAQ action.',{code:'INVALID_ACTION'});
  const question=String(input.question||'').trim(),answer=sanitizeFaqHtml(input.answer);
  if(!question||question.length>500||!answer||answer.length>10000)throw new EndpointError('Provide a Question (up to 500 characters) and Answer (up to 10,000 characters).',{code:'INVALID_INPUT'});
  const params={':id':id,':question':question,':answer':answer};
  if(action==='create')await db.run(`INSERT INTO support_faqs(id,question,answer,created_at,updated_at) SELECT :id,:question,:answer,unixepoch(),unixepoch() WHERE (SELECT count(*) FROM support_faqs)<500 ON CONFLICT(id) DO NOTHING`,params);
  else await db.run('UPDATE support_faqs SET question=:question,answer=:answer,updated_at=unixepoch() WHERE id=:id',params);
  const saved=await db.get('SELECT question,answer FROM support_faqs WHERE id=:id',{':id':id});
  if(!saved)throw new EndpointError(action==='create'?'The limit of 500 FAQs has been reached.':'FAQ not found.',{code:action==='create'?'FAQ_LIMIT':'NOT_FOUND'});
  if(saved.question!==question||saved.answer!==answer)throw new EndpointError('FAQ changed. Refresh and retry.',{code:'FAQ_CHANGED'});
  return {success:true};
}
