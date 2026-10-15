/**
 * Telegram Serverless SQLite Database Schema
 *
 * Defines the edge persistence tables for PRIME Commercial:
 * - Users & loyalty points cache
 * - Business connections (Telegram Business account links)
 * - Automation settings & dynamic Secretary flows
 * - Chat interaction state & human takeover flags
 * - Edge order tracking and cache
 */

export default {
  tables: {
    users: {
      columns: {
        id: { type: 'text', primaryKey: true },
        tg_user_id: { type: 'text', unique: true, notNull: true },
        username: { type: 'text' },
        full_name: { type: 'text' },
        prime_member_id: { type: 'text' },
        points_balance: { type: 'integer', default: 0 },
        created_at: { type: 'text', notNull: true },
        updated_at: { type: 'text', notNull: true }
      }
    },
    business_connections: {
      columns: {
        id: { type: 'text', primaryKey: true },
        business_connection_id: { type: 'text', unique: true, notNull: true },
        user_id: { type: 'text', notNull: true },
        can_reply: { type: 'boolean', default: true },
        is_enabled: { type: 'boolean', default: true },
        created_at: { type: 'text', notNull: true }
      }
    },
    automation_settings: {
      columns: {
        id: { type: 'text', primaryKey: true },
        enabled: { type: 'boolean', default: true },
        fallback_enabled: { type: 'boolean', default: false },
        fallback_response: { type: 'text', default: '' },
        welcome_flow_id: { type: 'text', default: '' },
        business_connection_id: { type: 'text', default: '' }
      }
    },
    automation_flows: {
      columns: {
        id: { type: 'text', primaryKey: true },
        name: { type: 'text', notNull: true },
        active: { type: 'boolean', default: true },
        trigger_type: { type: 'text', default: 'message' }, // 'message' | 'callback'
        trigger_value: { type: 'text', default: '' },
        match_mode: { type: 'text', default: 'contains' },   // 'exact' | 'contains' | 'starts_with'
        response_text: { type: 'text', notNull: true },
        buttons_json: { type: 'text', default: '[]' },
        priority: { type: 'integer', default: 100 }
      }
    },
    chat_states: {
      columns: {
        chat_id: { type: 'text', primaryKey: true },
        paused_until: { type: 'integer', default: 0 },
        human_takeover: { type: 'boolean', default: false },
        last_customer_message: { type: 'text' },
        last_bot_message: { type: 'text' },
        updated_at: { type: 'text' }
      }
    },
    orders_edge: {
      columns: {
        id: { type: 'text', primaryKey: true },
        order_number: { type: 'text', unique: true },
        tg_user_id: { type: 'text', notNull: true },
        total_php: { type: 'real', default: 0 },
        status: { type: 'text', default: 'pending' },
        items_count: { type: 'integer', default: 0 },
        delivery_address: { type: 'text' },
        created_at: { type: 'text', notNull: true }
      }
    }
  }
};
