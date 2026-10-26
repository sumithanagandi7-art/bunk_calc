import XLSX from 'xlsx';

/**
 * Parse XLSX and CSV files directly without OCR
 */
export async function parseSpreadsheetDocument(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetNames = workbook.SheetNames;
  if (!sheetNames || sheetNames.length === 0) {
    return { rows: [], method: 'spreadsheet_direct' };
  }

  const sheet = workbook.Sheets[sheetNames[0]];
  // Convert sheet to json with raw headers
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!rawRows || rawRows.length === 0) {
    return { rows: [], method: 'spreadsheet_direct' };
  }

  // Find header row index
  let headerIndex = -1;
  let codeCol = -1;
  let nameCol = -1;
  let attendedCol = -1;
  let totalCol = -1;
  let pctCol = -1;

  for (let r = 0; r < Math.min(15, rawRows.length); r++) {
    const row = rawRows[r].map((cell) => String(cell).toLowerCase().trim());
    
    row.forEach((colText, c) => {
      if (/code|subject\s*code|course\s*code/i.test(colText)) codeCol = c;
      if (/subject|subject\s*name|course|course\s*title/i.test(colText)) nameCol = c;
      if (/attended|present|presents|classes\s*attended/i.test(colText)) attendedCol = c;
      if (/total|conducted|held|total\s*classes/i.test(colText)) totalCol = c;
      if (/percentage|pct|%/i.test(colText)) pctCol = c;
    });

    if (nameCol !== -1 || codeCol !== -1 || attendedCol !== -1) {
      headerIndex = r;
      break;
    }
  }

  const extractedRows = [];

  // If header found, extract rows below header
  if (headerIndex !== -1) {
    for (let r = headerIndex + 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row || row.length === 0) continue;

      const codeVal = codeCol !== -1 ? String(row[codeCol] || '').trim() : '';
      const nameVal = nameCol !== -1 ? String(row[nameCol] || '').trim() : '';
      const attVal = attendedCol !== -1 ? parseInt(row[attendedCol], 10) : NaN;
      const totVal = totalCol !== -1 ? parseInt(row[totalCol], 10) : NaN;
      const pctVal = pctCol !== -1 ? parseFloat(row[pctCol]) : NaN;

      if (codeVal || nameVal) {
        // Filter out summary/total footer rows
        if (/^total$|^average$|^grand total$/i.test(nameVal || codeVal)) continue;

        extractedRows.push({
          raw_code: codeVal,
          raw_name: nameVal,
          attended: !isNaN(attVal) ? Math.max(0, attVal) : null,
          total: !isNaN(totVal) ? Math.max(0, totVal) : null,
          percentage: !isNaN(pctVal) ? pctVal : null,
        });
      }
    }
  } else {
    // Heuristic scanner if no explicit headers found
    for (let r = 0; r < rawRows.length; r++) {
      const row = rawRows[r].filter((cell) => cell !== '');
      if (row.length < 2) continue;

      let code = '';
      let name = '';
      let attended = null;
      let total = null;

      row.forEach((cell) => {
        const str = String(cell).trim();
        if (/^[0-9]{2}[A-Z]{2,6}[0-9]{2,4}[A-Z0-9/]*$/i.test(str) || /^[A-Z]{2,4}\d{2,4}$/i.test(str)) {
          code = str;
        } else if (isNaN(cell) && str.length > 2 && !name) {
          name = str;
        } else if (!isNaN(cell) && Number(cell) >= 0 && Number(cell) < 300) {
          const num = parseInt(cell, 10);
          if (attended === null) attended = num;
          else if (total === null) total = num;
        }
      });

      if (code || name) {
        extractedRows.push({
          raw_code: code,
          raw_name: name,
          attended,
          total,
          percentage: null,
        });
      }
    }
  }

  return {
    rows: extractedRows,
    method: 'spreadsheet_direct',
  };
}
