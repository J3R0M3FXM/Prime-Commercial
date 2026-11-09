import { db } from 'sdk';
export async function ensureFaqs() {
  if(!await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='support_faqs'")) {
    try {await db.run('CREATE TABLE IF NOT EXISTS support_faqs(id TEXT PRIMARY KEY,question TEXT NOT NULL,answer TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)');}
    catch(error){if(!await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='support_faqs'"))throw error;}
  }
}
export async function listFaqs(){await ensureFaqs();return db.all('SELECT id,question,answer FROM support_faqs ORDER BY created_at,id LIMIT 500');}
