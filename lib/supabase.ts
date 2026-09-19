import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClientInstance: SupabaseClient | null = null;
let supabaseAdminInstance: SupabaseClient | null = null;

/**
 * Check if Supabase credentials are configured in the environment
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(url && key && url.startsWith('http'));
}

/**
 * Client-safe / Public Supabase Client (Lazy Initialized)
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!supabaseClientInstance) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;
    supabaseClientInstance = createClient(url, anonKey, {
      auth: {
        persistSession: false,
      },
    });
  }
  return supabaseClientInstance;
}

/**
 * Server-side / Admin Supabase Client with full privileges (Lazy Initialized)
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!supabaseAdminInstance) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    supabaseAdminInstance = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return supabaseAdminInstance;
}

/**
 * Helper to upload Base64 or Binary to a Supabase Storage Bucket
 */
export async function uploadToSupabaseStorage(params: {
  bucket: string;
  path: string;
  data: string | Buffer | Uint8Array;
  contentType?: string;
  upsert?: boolean;
}): Promise<{ url: string; path: string; error?: string }> {
  const supabase = getSupabaseAdmin() || getSupabaseClient();
  if (!supabase) {
    return { url: '', path: '', error: 'Supabase is not configured' };
  }

  const { bucket, path, data, contentType = 'image/png', upsert = true } = params;

  let fileBuffer: Buffer | Uint8Array;

  if (typeof data === 'string') {
    if (data.startsWith('data:')) {
      // Base64 Data URL
      const base64Content = data.split(',')[1] || data;
      fileBuffer = Buffer.from(base64Content, 'base64');
    } else {
      fileBuffer = Buffer.from(data, 'base64');
    }
  } else {
    fileBuffer = data;
  }

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, fileBuffer, {
      contentType,
      upsert,
    });

  if (uploadError) {
    console.error(`Supabase Storage Upload Error (${bucket}/${path}):`, uploadError);
    return { url: '', path: '', error: uploadError.message };
  }

  const { data: publicUrlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);

  return {
    url: publicUrlData.publicUrl,
    path,
  };
}
