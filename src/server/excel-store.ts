import * as XLSX from 'xlsx';
import path from 'path';

function parseFile() {
  const filePath = path.resolve(process.cwd(), 'query_devops.xlsx');
  console.log('Attempting to read Excel file at:', filePath);
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(worksheet);
  } catch (error) {
    console.error('Error reading excel file at path:', filePath, error);
    return [];
  }
}

const cachedData = parseFile();

export function getExcelData() {
  return cachedData;
}
