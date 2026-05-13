import XLSX from 'xlsx';
const wb = XLSX.readFile('query_devops.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, {defval: ''});
console.log('Headers:', JSON.stringify(Object.keys(data[0])));
console.log('Row count:', data.length);
console.log('First row:', JSON.stringify(data[0]));
if (data.length > 1) console.log('Second row:', JSON.stringify(data[1]));
if (data.length > 2) console.log('Third row:', JSON.stringify(data[2]));