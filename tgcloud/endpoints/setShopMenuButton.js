import { api } from 'sdk';
import { requireAdmin } from '../lib/auth.js';

const SHOP_URL = 'https://app8830494959.tgcloud.ai/';

export default async function (_input = {}, ctx) {
  await requireAdmin(ctx);

  await api.setChatMenuButton({
    menu_button: {
      type: 'web_app',
      text: 'SHOP',
      web_app: { url: SHOP_URL },
    },
  });

  return { success: true };
}
