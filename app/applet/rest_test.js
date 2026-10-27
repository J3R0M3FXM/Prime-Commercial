const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("URL:", url ? "Present" : "Missing");
console.log("KEY:", key ? "Present" : "Missing");

async function test() {
  if (!url || !key) return;
  
  try {
    const res = await fetch(`${url}/rest/v1/products?select=*`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    const data = await res.json();
    console.log("Supabase Products API Response:", data);
  } catch (e) {
    console.error("Fetch error:", e);
  }
}

test();
