/**
 * Table Detector & Grid Structure Extraction Service
 *
 * Detects table structure from OCR/PDF text and maps columns by their headers
 * instead of assuming a fixed column order.
 */

/**
 * Known column header patterns for attendance tables
 */
const COLUMN_PATTERNS = {
  serial: /^(?:sl\.?\s*no\.?|s\.?\s*no\.?|#|sr\.?\s*no\.?|no\.?)$/i,
  code: /(?:course|subject)\s*code|sub\.?\s*code|code/i,
  name: /(?:course|subject)\s*(?:name|title)|title|course\s*name|sub\.?\s*name/i,
  faculty: /faculty|instructor|teacher|professor|prof\.?/i,
  conducted: /(?:classes?\s*)?(?:conducted|held|scheduled|total\s*classes?)|tot(?:al)?\s*cl/i,
  attended: /(?:classes?\s*)?(?:attended|present)|presents?/i,
  absent: /(?:classes?\s*)?(?:absent|missed|bunked)|absents?/i,
  percentage: /(?:attendance\s*)?(?:percentage|%|pct|att\.?\s*%)/i,
  condoned: /condoned|condon|exemp/i,
};

/**
 * Attempt to identify column roles from a header row
 */
function identifyColumns(headerCells) {
  const columns = {};
  const unmapped = [];

  for (let i = 0; i < headerCells.length; i++) {
    const cell = headerCells[i].trim();
    if (!cell) continue;

    let matched = false;
    for (const [role, pattern] of Object.entries(COLUMN_PATTERNS)) {
      if (pattern.test(cell)) {
        if (!columns[role]) {
          columns[role] = i;
          matched = true;
          break;
        }
      }
    }
    if (!matched) {
      unmapped.push({ index: i, text: cell });
    }
  }

  return { columns, unmapped };
}

/**
 * Check if a line looks like a header row
 */
function isHeaderRow(line) {
  const lower = line.toLowerCase();
  const headerKeywords = ['course code', 'subject code', 'subject name', 'classes conducted',
    'classes attended', 'attendance', 'percentage', 'sl.', 'sl no', 's.no', 'course title',
    'sub code', 'faculty', 'held', 'present', 'absent'];

  let matchCount = 0;
  for (const kw of headerKeywords) {
    if (lower.includes(kw)) matchCount++;
  }
  return matchCount >= 2;
}

/**
 * Check if a line looks like a data row (contains a subject code pattern and numbers)
 */
function isDataRow(line) {
  const subjectCodeRegex = /\b(?:[0-9]{2}[A-Z]{2,6}[0-9]{1,4}[A-Z0-9/]*|U[0-9]{2}[A-Z]{2,5}[0-9]{1,4}|[A-Z]{2,5}\s*[-_]?\s*[0-9]{1,4}[A-Z]?|PPL|LA\/PD|AAV15V|TA\/PD)\b/i;
  const hasCode = subjectCodeRegex.test(line);
  const numbers = (line.match(/\b\d+(?:\.\d+)?\b/g) || []);
  return hasCode || (numbers.length >= 2 && line.length > 10);
}

/**
 * Check if a row looks like a total/summary row
 */
function isSummaryRow(text) {
  return /\b(?:total|average|grand\s*total|overall|aggregate|summary|mean)\b/i.test(text);
}

/**
 * Parse a line into cells based on common delimiters
 */
function splitIntoCells(line) {
  // Try tab-separated first
  if (line.includes('\t')) {
    return line.split('\t').map(c => c.trim());
  }
  // Try pipe-separated
  if (line.includes('|')) {
    return line.split('|').map(c => c.trim()).filter(Boolean);
  }
  // Try multiple-space separation (common in OCR output)
  const cells = line.split(/\s{2,}/).map(c => c.trim()).filter(Boolean);
  if (cells.length >= 3) return cells;

  // Fallback: return the whole line
  return [line.trim()];
}

/**
 * Extract subject code from text
 */
function extractSubjectCode(text) {
  const subjectCodeRegex = /\b([0-9]{2}[A-Z]{2,6}[0-9]{1,4}[A-Z0-9/]*|22IN55\/ISP5\/22IY5|U[0-9]{2}[A-Z]{2,5}[0-9]{1,4}|[A-Z]{2,5}\s*[-_]?\s*[0-9]{1,4}[A-Z]?|PPL|LA\/PD|AAV15V|TA\/PD)\b/i;
  const match = text.match(subjectCodeRegex);
  return match ? match[1].toUpperCase().replace(/\s+/g, '') : null;
}

/**
 * Main table detection entry point.
 * Analyzes text to find attendance table rows, using header detection for column mapping.
 */
export function detectTableStructure(rawText) {
  if (!rawText) return { hasTable: false, rows: [], warnings: [], headerDetected: false };

  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  const rows = [];
  const warnings = [];

  let headerColumns = null;
  let headerDetected = false;
  let hasTable = false;

  // First pass: find header row
  for (let i = 0; i < lines.length; i++) {
    if (isHeaderRow(lines[i])) {
      const headerCells = splitIntoCells(lines[i]);
      const { columns, unmapped } = identifyColumns(headerCells);
      
      if (Object.keys(columns).length >= 2) {
        headerColumns = columns;
        headerDetected = true;
        hasTable = true;

        if (unmapped.length > 0) {
          warnings.push(`Unmapped header columns: ${unmapped.map(u => `"${u.text}" (col ${u.index})`).join(', ')}`);
        }
        break;
      }
    }
  }

  // Second pass: extract data rows
  for (const line of lines) {
    if (isHeaderRow(line)) continue;
    if (isSummaryRow(line)) {
      // Skip but note it
      continue;
    }

    const code = extractSubjectCode(line);
    const numbers = (line.match(/\b\d+(?:\.\d+)?\b/g) || []).map((n) => parseFloat(n));

    if (!code && numbers.length < 2) continue;
    if (!code && line.length <= 5) continue;

    hasTable = true;
    const cells = splitIntoCells(line);

    let subjectCode = code || '';
    let subjectName = '';
    let facultyName = '';
    let attended = null;
    let total = null;
    let absent = null;
    let percentage = null;

    if (headerColumns && cells.length >= 3) {
      // Use header-mapped columns
      if (headerColumns.code !== undefined && cells[headerColumns.code]) {
        subjectCode = extractSubjectCode(cells[headerColumns.code]) || cells[headerColumns.code].trim();
      }
      if (headerColumns.name !== undefined && cells[headerColumns.name]) {
        subjectName = cells[headerColumns.name].trim();
      }
      if (headerColumns.faculty !== undefined && cells[headerColumns.faculty]) {
        facultyName = cells[headerColumns.faculty].trim();
      }
      if (headerColumns.attended !== undefined && cells[headerColumns.attended]) {
        const val = parseInt(cells[headerColumns.attended], 10);
        if (!isNaN(val) && val >= 0 && val < 500) attended = val;
      }
      if (headerColumns.conducted !== undefined && cells[headerColumns.conducted]) {
        const val = parseInt(cells[headerColumns.conducted], 10);
        if (!isNaN(val) && val >= 0 && val < 500) total = val;
      }
      if (headerColumns.absent !== undefined && cells[headerColumns.absent]) {
        const val = parseInt(cells[headerColumns.absent], 10);
        if (!isNaN(val) && val >= 0 && val < 500) absent = val;
      }
      if (headerColumns.percentage !== undefined && cells[headerColumns.percentage]) {
        const pctText = cells[headerColumns.percentage].replace(/%/g, '').trim();
        const val = parseFloat(pctText);
        if (!isNaN(val) && val >= 0 && val <= 100) percentage = val;
      }
    } else {
      // Fallback: heuristic column extraction from the line
      let remaining = code ? line.replace(code, '').trim() : line;

      // Strip noise words
      remaining = remaining.replace(/\b(?:attendance|cie|lesson|notes|status|condoned|feedback|manual)\b/gi, '').trim();

      // Strip email addresses
      remaining = remaining.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '').trim();

      // Strip classroom/lab room codes at end (e.g. 244C, 137A, Lab 1,2, 128A/134A)
      remaining = remaining.replace(/\b(?:Lab\s*[\d,\s&]+|\d{3}[A-Z]?(?:\/\d{3}[A-Z]?)?|\d{3}[A-Z]?\/Lab\s*\d+)\b$/i, '').trim();

      const facultyMatch = remaining.match(/(?:Dr\.|Ms\.|Mr\.|Prof\.|F1:|F2:|F3:|NL\d|[A-Z]{2,}(?:\/[A-Z0-9]+){2,})\s*[^()]*(?:\([^()]+\))?/i);
      if (facultyMatch) {
        subjectName = remaining.substring(0, facultyMatch.index).trim();
        facultyName = remaining.substring(facultyMatch.index).trim();
      } else {
        subjectName = remaining.replace(/\b\d+(?:\.\d+)?%?\b/g, '').replace(/^[-\s|:]+/, '').trim();
      }

      // Strip trailing subject initials
      subjectName = subjectName.replace(/\b(?:CN|TOC|CN LAB|5G|EH|DSP|DevOps|IoT|QM|RM|MATLAB|UI\s*\/UX\s*LAB|TBST\s*Lab|CS|IPC|OE|NSS\/PE\/Y|PPL|LA\/PD|[A-Z]{2,6})\b$/i, '').trim();

      const integers = numbers.filter((n) => Number.isInteger(n) && n >= 0 && n < 500);
      const floats = numbers.filter((n) => !Number.isInteger(n) && n >= 0 && n <= 100);

      // Filter out serial numbers (typically 1-20 at start) and very large numbers
      const filteredInts = integers.filter(n => n > 0);

      // With no header info, we can't reliably assign meaning to columns
      // Use heuristics: larger number is likely "conducted", smaller is "attended"
      if (filteredInts.length >= 2) {
        // Skip first number if it looks like a serial number (single digit at start of line)
        let startIdx = 0;
        if (filteredInts.length >= 3 && filteredInts[0] < 20 && filteredInts[1] > filteredInts[0]) {
          startIdx = 1; // Skip serial number
        }

        const candidates = filteredInts.slice(startIdx);
        if (candidates.length >= 2) {
          // The larger is likely total, smaller is attended
          const sorted = [...candidates.slice(0, 2)].sort((a, b) => a - b);
          attended = sorted[0];
          total = sorted[1];

          warnings.push(`Column order inferred heuristically for "${subjectCode || subjectName}". Review recommended.`);
        } else if (candidates.length === 1) {
          attended = candidates[0];
        }
      } else if (filteredInts.length === 1) {
        attended = filteredInts[0];
      }

      percentage = floats.length >= 1 ? floats[0] : null;
    }

    // Derive absent if not explicitly found
    if (absent === null && attended !== null && total !== null && total >= attended) {
      absent = total - attended;
    }

    if (subjectCode || subjectName) {
      rows.push({
        raw_code: subjectCode || '',
        subject_code: subjectCode || '',
        raw_name: subjectName || (subjectCode ? `Subject ${subjectCode}` : ''),
        subject_name: subjectName || (subjectCode ? `Subject ${subjectCode}` : ''),
        faculty_name: facultyName || '',
        attended,
        classes_attended: attended,
        absents: absent,
        total,
        classes_conducted: total,
        total_classes: total,
        attendance_percentage: percentage,
        percentage,
        header_mapped: headerDetected,
      });
    }
  }

  if (!headerDetected && rows.length > 0) {
    warnings.push('No header row detected. Column assignments are heuristic and may be incorrect. User review required.');
  }

  return {
    hasTable,
    headerDetected,
    rowCount: rows.length,
    rows,
    warnings,
    columnMapping: headerColumns,
  };
}
