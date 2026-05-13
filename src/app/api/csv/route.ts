import { NextResponse } from 'next/server';
import { getExcelData } from '~/server/excel-store';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const data = getExcelData();
    return NextResponse.json({ success: true, data });
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to read data' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { content } = (await request.json()) as { content: string };
    const filePath = path.join(process.cwd(), 'epicos_data.csv');
    fs.writeFileSync(filePath, content, 'utf8');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving file:', error);
    return NextResponse.json({ error: 'Failed to save data' }, { status: 500 });
  }
}