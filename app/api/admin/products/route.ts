import { NextResponse } from 'next/server';
import { cacheStore } from '@/lib/cache';
import { 
  createProductInDb, 
  updateProductInDb, 
  deleteProductInDb, 
  updateProductInDb as reorderProductInDb 
} from '@/lib/db-adapter';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    const product = await request.json();
    const result = await createProductInDb(product);
    cacheStore.invalidateProducts();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();

    // Handle batch reordering
    if (Array.isArray(body.reorder)) {
      for (const item of body.reorder) {
        if (item.id) {
          await reorderProductInDb(item.id, { sortOrder: Number(item.sortOrder) || 0 });
        }
      }
      cacheStore.invalidateProducts();
      return NextResponse.json({ success: true, count: body.reorder.length });
    }

    const { id, ...data } = body;
    await updateProductInDb(id, data);
    cacheStore.invalidateProducts();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json();
    await deleteProductInDb(id);
    cacheStore.invalidateProducts();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
