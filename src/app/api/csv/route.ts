import { NextResponse } from 'next/server';
import { getExcelData } from '~/server/excel-store';
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
    const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as BodyInit;

    // Return the XLSX as a download response
    const fileName = `planejamento_exportado_${new Date().getTime()}.xlsx`;

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('Error saving excel file:', error);
    return NextResponse.json({ error: 'Failed to save data' }, { status: 500 });
  }
}