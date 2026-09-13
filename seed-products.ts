const { db } = require('./lib/firebase');
const { collection, addDoc } = require('firebase/firestore');

async function seedProducts() {
  const productsCol = collection(db, 'products');
  const sampleProducts = Array.from({ length: 10 }, (_, i) => ({
    name: `Premium Product ${i + 1}`,
    price: (i + 1) * 10.99,
    stock: 50,
    description: `High-quality sample product ${i + 1} with premium features.`,
    bundleConfig: { enabled: i % 2 === 0, discount: 15 },
    category: 'Featured'
  }));

  for (const p of sampleProducts) {
    await addDoc(productsCol, { ...p, createdAt: new Date() });
  }
  console.log('Seeded 10 products');
}

seedProducts();
