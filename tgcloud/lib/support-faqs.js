import { db } from 'sdk';
const allowedTags = new Set(['p','br','strong','b','em','i','u','s','blockquote','h2','h3','h4','ul','ol','li','table','thead','tbody','tr','th','td','a','code','pre']);
export function sanitizeFaqHtml(input) {
  let html = String(input ?? '');
  html = html.replace(/<!--([\s\S]*?)-->/g, '').replace(/<\/?([a-z0-9]+)(?:\s[^>]*)?>/gi, (tag, name) => {
    const lower = String(name).toLowerCase();
    if (!allowedTags.has(lower)) return '';
    if (tag[1] === '/') return `</${lower}>`;
    if (lower === 'a') {
      const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1] || '';
      return /^(https?:|mailto:)/i.test(href) ? `<a href="${href.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" target="_blank" rel="noopener noreferrer">` : '';
    }
    return `<${lower}>`;
  });
  return html.trim();
}
export async function ensureFaqs() {
  if(!await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='support_faqs'")) {
    try {await db.run('CREATE TABLE IF NOT EXISTS support_faqs(id TEXT PRIMARY KEY,question TEXT NOT NULL,answer TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)');}
    catch(error){if(!await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='support_faqs'"))throw error;}
  }
}
export async function listFaqs(){await ensureFaqs();const rows=await db.all('SELECT id,question,answer FROM support_faqs ORDER BY created_at,id LIMIT 500');return rows.map(row=>({...row,answer:sanitizeFaqHtml(row.answer)}));}
