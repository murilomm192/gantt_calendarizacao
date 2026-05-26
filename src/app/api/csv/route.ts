import { NextResponse } from 'next/server';
import { getExcelData } from '~/server/excel-store';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

export async function GET() {
  try {
    const data = getExcelData();
    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ error: 'Failed to read data' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { data } = (await request.json()) as { data: Record<string, unknown>[] };

    if (!data || !Array.isArray(data)) {
      return NextResponse.json({ error: 'Invalid data format' }, { status: 400 });
    }

    // Create a new workbook and worksheet
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Planejamento');

    // Generate buffer
    const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    // Save to a new file
    const fileName = `planejamento_exportado_${new Date().getTime()}.xlsx`;
    const filePath = path.join(process.cwd(), fileName);
    fs.writeFileSync(filePath, buf);

    return NextResponse.json({ success: true, fileName });
  } catch (error) {
    console.error('Error saving excel file:', error);
    return NextResponse.json({ error: 'Failed to save data' }, { status: 500 });
  }
}