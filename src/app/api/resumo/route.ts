import { NextResponse } from 'next/server';
import { getResumoData } from '~/server/resumo-store';

export async function GET() {
  try {
    const data = getResumoData();
    return NextResponse.json({ success: true, data });
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to load resumo data' }, { status: 500 });
  }
}
