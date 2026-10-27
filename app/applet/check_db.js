const { getSupabaseAdmin, isSupabaseAdminConfigured } = require('./lib/supabase');

async function check() {
  console.log("Admin configured:", isSupabaseAdminConfigured());
  const admin = getSupabaseAdmin();
  if (!admin) {
    console.log("No admin client available.");
    return;
  }
  
  const { data: prodData, error: prodErr } = await admin.from('products').select('*');
  console.log("Products:", prodData?.length, prodErr);

  const { data: ordData, error: ordErr } = await admin.from('orders').select('*');
  console.log("Orders:", ordData?.length, ordErr);

  const { data: custData, error: custErr } = await admin.from('customers').select('*');
  console.log("Customers:", custData?.length, custErr);
}

check();
