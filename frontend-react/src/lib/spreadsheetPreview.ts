export type SpreadsheetPreview = {
  headers: string[];
  rows: Record<string, string>[];
};

export async function readSpreadsheetPreview(file: File, maxRows = 5): Promise<SpreadsheetPreview> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { headers: [], rows: [] };
  }
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: '',
  });
  if (!matrix.length) {
    return { headers: [], rows: [] };
  }

  const headers = (matrix[0] || []).map((value) => String(value || '').trim());
  const rows = matrix.slice(1, maxRows + 1).map((row) => {
    const entry: Record<string, string> = {};
    headers.forEach((header, index) => {
      entry[header || `col_${index + 1}`] = String(row[index] ?? '').trim();
    });
    return entry;
  });

  return { headers, rows };
}
