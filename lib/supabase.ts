import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClientInstance: SupabaseClient | null = null;
let supabaseAdminInstance: SupabaseClient | null = null;

/**
 * Check if Supabase credentials are configured in the environment
 */
function getSupabasePublicKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    // Compatibility fallback for environments that have not yet migrated.
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    ''
  );
}

function getSupabaseSecretKey(): string {
  return (
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    // Compatibility fallback for environments that have not yet migrated.
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    ''
  );
}

/**
 * Check if Supabase credentials are configured in the environment.
 * Prefer modern publishable keys; legacy anon keys may be disabled.
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  return Boolean(url && getSupabasePublicKey() && url.startsWith('http'));
}

/**
 * Client-safe / Public Supabase Client (Lazy Initialized)
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!supabaseClientInstance) {
    const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)!;
    const publicKey = getSupabasePublicKey();
    supabaseClientInstance = createClient(url, publicKey, {
      auth: {
        persistSession: false,
      },
    });
  }
  return supabaseClientInstance;
}

/**
 * Admin database operations require the server-only Supabase secret key.
 * Never expose this key to client-side code.
 */
export function isSupabaseAdminConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  return Boolean(url && getSupabaseSecretKey() && url.startsWith('http'));
}

/**
 * Server-side / Admin Supabase Client with full privileges (Lazy Initialized)
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const secretKey = getSupabaseSecretKey();
  if (!url || !secretKey || !url.startsWith('http')) return null;
  if (!supabaseAdminInstance) {
    supabaseAdminInstance = createClient(url, secretKey, {
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
  const supabase = getSupabaseAdmin();
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

  let uploadResult = await supabase.storage
    .from(bucket)
    .upload(path, fileBuffer, {
      contentType,
      upsert,
    });

  if (uploadResult.error && (uploadResult.error.message?.includes('not found') || uploadResult.error.message?.includes('Bucket'))) {
    try {
      await supabase.storage.createBucket(bucket, {
        public: true,
        fileSizeLimit: 10485760,
      });
      uploadResult = await supabase.storage
        .from(bucket)
        .upload(path, fileBuffer, {
          contentType,
          upsert,
        });
    } catch (bucketCreateErr) {
      console.warn(`Could not auto-create storage bucket ${bucket}:`, bucketCreateErr);
    }
  }

  if (uploadResult.error) {
    console.error(`Supabase Storage Upload Error (${bucket}/${path}):`, uploadResult.error);
    return { url: '', path: '', error: uploadResult.error.message };
  }

  const { data: publicUrlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);

  return {
    url: publicUrlData.publicUrl,
    path,
  };
}
