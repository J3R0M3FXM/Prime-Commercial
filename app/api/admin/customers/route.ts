import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // TODO: Add proper Admin token/session validation
  const usersCol = collection(db, 'users');
  const userSnap = await getDocs(usersCol);
  const users = userSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return NextResponse.json(users);
}
