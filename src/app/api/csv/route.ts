import { NextResponse } from 'next/server';
import { getExcelData } from '~/server/excel-store';

export async function GET() {
  try {
    const data = getExcelData();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to read data' }, { status: 500 });
  }
}