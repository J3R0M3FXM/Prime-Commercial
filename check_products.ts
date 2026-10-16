import { getSupabaseAdmin } from './lib/supabase';

async function checkProducts() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.log("Supabase not configured");
    return;
  }
  const { data, error } = await supabase.from('products').select('*');
  if (error) {
    console.error("Error fetching products:", error);
  } else {
    console.log("Products found:", data.length);
    console.log(JSON.stringify(data, null, 2));
  }
}

checkProducts();
