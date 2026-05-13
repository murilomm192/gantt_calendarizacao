import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

function excelDateToJSDate(serial: number) {
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);

  const fractional_day = serial - Math.floor(serial) + 0.0000001;
  let total_seconds = Math.floor(86400 * fractional_day);

  const seconds = total_seconds % 60;
  total_seconds = Math.floor(total_seconds / 60);
  const minutes = total_seconds % 60;
  const hours = Math.floor(total_seconds / 60);

  return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate(), hours, minutes, seconds);
}

function formatDate(date: Date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y} 00:00:00`;
}

function parseFile(): Record<string, any>[] {
  const filePath = path.resolve(process.cwd(), 'query_devops.xlsx');
  
  if (!fs.existsSync(filePath)) {
    console.error('File not found at:', filePath);
    return [];
  }

  try {
    const fileBuffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) return [];

    // Get raw data as array of arrays to find header row
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
    
    // Find the row that contains 'ID' and 'Work Item Type'
    let headerRowIndex = -1;
    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      if (row && row.includes('ID') && row.includes('Work Item Type')) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      console.error('Could not find header row in Excel file');
      return [];
    }

    const headers = rawData[headerRowIndex] as string[];
    const dataRows = rawData.slice(headerRowIndex + 1);

    return dataRows.map(row => {
      const obj: Record<string, any> = {};
      headers.forEach((header, index) => {
        let value = row[index];
        
        // Handle Excel serial dates for specific columns
        if (typeof value === 'number' && (header.includes('Date') || header === 'Start Date' || header === 'Target Date')) {
          value = formatDate(excelDateToJSDate(value));
        }
        
        obj[header] = value;
      });
      return obj;
    }).filter(row => row.ID || row.Title);
  } catch (error) {
    console.error('Error reading excel file:', error);
    return [];
  }
}

export function getExcelData(): Record<string, any>[] {
  // Always load from the Excel file as requested
  return parseFile();
}
