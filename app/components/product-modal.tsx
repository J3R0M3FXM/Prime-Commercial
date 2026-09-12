"use client";
import React from 'react';
import { useCart } from './cart-context';

export default function ProductModal({ product, onClose }: { product: any, onClose: () => void }) {
  const { addToCart } = useCart();

  if (!product) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white p-4 rounded-lg w-full max-w-sm">
        <h2 className="text-xl font-bold">{product.name}</h2>
        <img src={product.imageUrl} alt={product.name} className="w-full h-48 object-cover my-2" />
        <p className="text-gray-600">{product.description}</p>
        <p className="font-bold mt-2">${product.price}</p>
        {product.bundleConfig?.enabled && (
            <p className="text-sm text-green-600">Buy More, Save More: {product.bundleConfig.discount}% off!</p>
        )}
        <div className="mt-4 flex gap-2">
            <button onClick={onClose} className="flex-1 border p-2 rounded">Close</button>
            <button 
                onClick={() => { addToCart(product, 1); onClose(); }} 
                disabled={product.stock === 0}
                className="flex-1 bg-blue-600 text-white p-2 rounded disabled:bg-gray-400"
            >
                {product.stock === 0 ? "Out of Stock" : "Add to Cart"}
            </button>
        </div>
      </div>
    </div>
  );
}
