/**
 * Versioned Selector-based DOM Parser V1 for College Attendance Portals.
 * Supports Contineo ERP, Nitte Portal, VTU Portal, and Generic HTML Tables.
 */

const PortalParserV1 = {
  version: '1.0.0',

  /**
   * Main entry point to extract attendance subjects and records from current DOM document
   */
  parseDocument(doc = document) {
    console.log('[BunkCalc Sync] Running PortalParserV1 on page...');

    // Try strategy 1: Contineo ERP Table
    let result = this.parseContineoERP(doc);
    if (result && result.subjects && result.subjects.length > 0) {
      console.log('[BunkCalc Sync] Matched Strategy: Contineo ERP', result);
      return result;
    }

    // Try strategy 2: Nitte / VTU Table
    result = this.parseNitteVTUTable(doc);
    if (result && result.subjects && result.subjects.length > 0) {
      console.log('[BunkCalc Sync] Matched Strategy: Nitte / VTU Portal', result);
      return result;
    }

    // Try strategy 3: Generic HTML Table Grid
    result = this.parseGenericTable(doc);
    if (result && result.subjects && result.subjects.length > 0) {
      console.log('[BunkCalc Sync] Matched Strategy: Generic Table Grid', result);
      return result;
    }

    // Fallback failure diagnostic
    return {
      success: false,
      version: this.version,
      error: 'Unable to locate a recognized attendance table format on this page. Please navigate to your portal\'s attendance page.',
      subjects: []
    };
  },

  /**
   * Strategy 1: Contineo ERP Portal Parser
   */
  parseContineoERP(doc) {
    const tables = doc.querySelectorAll('table');
    const subjects = [];

    tables.forEach((table) => {
      const rows = Array.from(table.querySelectorAll('tr'));
      if (rows.length < 2) return;

      const headerCells = Array.from(rows[0].querySelectorAll('th, td')).map(c => c.innerText.toLowerCase().trim());
      const headerText = headerCells.join(' ');
      
      if (headerText.includes('course') || headerText.includes('subject') || headerText.includes('attendance')) {
        let codeCol = -1, nameCol = -1, attendedCol = -1, conductedCol = -1, absentCol = -1, pctCol = -1, serialCol = -1;

        headerCells.forEach((h, idx) => {
          if (/^(?:sl\.?\s*no\.?|s\.?\s*no\.?|#)$/i.test(h)) serialCol = idx;
          else if (/course\s*code|sub(?:ject)?\s*code|^code$/i.test(h)) codeCol = idx;
          else if (/course\s*name|sub(?:ject)?\s*name|course\s*title|title/i.test(h)) nameCol = idx;
          else if (/conducted|classes\s*held|held|total\s*classes/i.test(h)) conductedCol = idx;
          else if (/attended|classes\s*attended|presents?/i.test(h)) attendedCol = idx;
          else if (/absents?|missed/i.test(h)) absentCol = idx;
          else if (/percentage|%|att\.?\s*%/i.test(h)) pctCol = idx;
        });

        for (let i = 1; i < rows.length; i++) {
          const cells = Array.from(rows[i].querySelectorAll('td, th')).map(c => c.innerText.trim());
          if (cells.length < 2) continue;

          // Check if this is a summary row
          const rowText = cells.join(' ').toLowerCase();
          if (/\b(?:total|average|grand\s*total|overall|aggregate|summary)\b/i.test(rowText)) continue;

          let rawCode = '';
          let rawName = '';
          let attended = null;
          let conducted = null;
          let absents = null;

          if (codeCol !== -1 && cells[codeCol]) rawCode = cells[codeCol];
          if (nameCol !== -1 && cells[nameCol]) rawName = cells[nameCol];

          // If columns weren't identified, determine from text/cells
          if (!rawCode && !rawName) {
            const startIdx = serialCol === 0 ? 1 : 0;
            rawCode = cells[startIdx] || '';
            rawName = cells[startIdx + 1] || rawCode;
          }

          if (attendedCol !== -1 && cells[attendedCol]) {
            const val = parseInt(cells[attendedCol], 10);
            if (!isNaN(val)) attended = val;
          }
          if (conductedCol !== -1 && cells[conductedCol]) {
            const val = parseInt(cells[conductedCol], 10);
            if (!isNaN(val)) conducted = val;
          }
          if (absentCol !== -1 && cells[absentCol]) {
            const val = parseInt(cells[absentCol], 10);
            if (!isNaN(val)) absents = val;
          }

          // Fallback parsing for numbers if columns not mapped
          if (attended === null || conducted === null) {
            // Find numeric cells, excluding serial column and percentage columns
            const candidateNums = [];
            cells.forEach((cell, idx) => {
              if (idx === serialCol || idx === codeCol || idx === nameCol || idx === pctCol) return;
              if (cell.includes('%')) return;
              const n = parseInt(cell, 10);
              if (!isNaN(n)) candidateNums.push(n);
            });

            if (candidateNums.length >= 2) {
              // Heuristic: attended is never greater than conducted
              const sorted = [...candidateNums].sort((a, b) => b - a);
              if (conducted === null) conducted = sorted[0];
              if (attended === null) attended = sorted[1];
            } else if (candidateNums.length === 1) {
              if (attended === null) attended = candidateNums[0];
            }
          }

          if (conducted !== null && attended !== null) {
            if (attended > conducted) {
              // Swap if attended was mistakenly higher than conducted
              const tmp = attended;
              attended = conducted;
              conducted = tmp;
            }
            if (absents === null) {
              absents = Math.max(0, conducted - attended);
            }
          }

          const normSub = typeof window !== 'undefined' && window.Normalizer
            ? window.Normalizer.normalizeSubject(rawCode || rawName, rawName || rawCode)
            : { subject_code: rawCode || 'SUB', subject_name: rawName || rawCode || 'Subject' };

          if (normSub.subject_code && (attended !== null || conducted !== null)) {
            subjects.push({
              subject_code: normSub.subject_code,
              subject_name: normSub.subject_name,
              presents: attended !== null ? attended : 0,
              absents: absents !== null ? absents : 0,
              total_classes_planned: Math.max(conducted || 0, (attended || 0) + (absents || 0), 40),
              records: [],
            });
          }
        }
      }
    });

    return {
      success: subjects.length > 0,
      parser: 'ContineoERP_V1',
      portal_name: 'Contineo ERP Portal',
      subjects
    };
  },

  /**
   * Strategy 2: Nitte / VTU Portal Attendance Parser
   */
  parseNitteVTUTable(doc) {
    const rows = doc.querySelectorAll('table tr, div.attendance-row, div.subject-card');
    const subjects = [];

    rows.forEach((row) => {
      const text = row.innerText || '';
      const codeMatch = text.match(/\b([0-9]{1,2}[A-Z]{2,6}[0-9]{1,4}[A-Z0-9]*)\b/i);
      
      if (codeMatch) {
        const code = codeMatch[1].toUpperCase();
        // Look for conducted vs attended numbers (e.g. 28 / 32 or Attended: 28, Total: 32)
        const countsMatch = text.match(/(\d+)\s*[\/\\]\s*(\d+)/) || text.match(/attended\s*:\s*(\d+).*?total\s*:\s*(\d+)/i);
        
        let attended = 0;
        let conducted = 40;

        if (countsMatch) {
          const n1 = parseInt(countsMatch[1], 10);
          const n2 = parseInt(countsMatch[2], 10);
          if (n1 <= n2) {
            attended = n1;
            conducted = n2;
          } else {
            conducted = n1;
            attended = n2;
          }
        }

        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const nameLine = lines.find(l => l.length > 4 && !l.includes(code) && !/\d+[\/\\]\d+/.test(l)) || `Subject ${code}`;
        const normSub = typeof window !== 'undefined' && window.Normalizer
          ? window.Normalizer.normalizeSubject(code, nameLine)
          : { subject_code: code, subject_name: nameLine };

        if (!subjects.some(s => s.subject_code === normSub.subject_code)) {
          subjects.push({
            subject_code: normSub.subject_code,
            subject_name: normSub.subject_name,
            presents: attended,
            absents: Math.max(0, conducted - attended),
            total_classes_planned: Math.max(conducted, 40),
            records: []
          });
        }
      }
    });

    return {
      success: subjects.length > 0,
      parser: 'NitteVTU_V1',
      portal_name: 'Academic Attendance Portal',
      subjects
    };
  },

  /**
   * Strategy 3: Generic HTML Table Grid Parser
   */
  parseGenericTable(doc) {
    const tables = doc.querySelectorAll('table');
    const subjects = [];

    tables.forEach((table) => {
      const rows = Array.from(table.querySelectorAll('tr'));
      if (rows.length < 2) return;

      let codeCol = -1, nameCol = -1, attendedCol = -1, totalCol = -1, absentCol = -1;

      // Find header column indices
      const headerCells = Array.from(rows[0].querySelectorAll('th, td')).map(c => c.innerText.toLowerCase().trim());
      headerCells.forEach((h, idx) => {
        if (h.includes('code') || h.includes('sub code') || h.includes('course code')) codeCol = idx;
        if (h.includes('name') || h.includes('subject') || h.includes('course name') || h.includes('title')) nameCol = idx;
        if (h.includes('attended') || h.includes('present') || h.includes('classes attended')) attendedCol = idx;
        if (h.includes('total') || h.includes('conducted') || h.includes('held')) totalCol = idx;
        if (h.includes('absent') || h.includes('missed')) absentCol = idx;
      });

      if (codeCol !== -1 || nameCol !== -1) {
        for (let i = 1; i < rows.length; i++) {
          const cells = Array.from(rows[i].querySelectorAll('td')).map(c => c.innerText.trim());
          if (cells.length > Math.max(codeCol, nameCol)) {
            const rawCode = codeCol !== -1 ? cells[codeCol] : '';
            const rawName = nameCol !== -1 ? cells[nameCol] : '';
            const normSub = typeof window !== 'undefined' && window.Normalizer
              ? window.Normalizer.normalizeSubject(rawCode || rawName, rawName)
              : { subject_code: rawCode || 'SUB', subject_name: rawName || 'Subject' };

            let presents = attendedCol !== -1 ? parseInt(cells[attendedCol], 10) || 0 : 0;
            let total = totalCol !== -1 ? parseInt(cells[totalCol], 10) || 0 : 0;
            let absents = absentCol !== -1 ? parseInt(cells[absentCol], 10) || 0 : Math.max(0, total - presents);

            if (normSub.subject_code) {
              subjects.push({
                subject_code: normSub.subject_code,
                subject_name: normSub.subject_name,
                presents,
                absents,
                total_classes_planned: Math.max(total, presents + absents, 40),
                records: []
              });
            }
          }
        }
      }
    });

    return {
      success: subjects.length > 0,
      parser: 'GenericTable_V1',
      portal_name: 'Generic Portal',
      subjects
    };
  }
};

if (typeof window !== 'undefined') {
  window.PortalParserV1 = PortalParserV1;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PortalParserV1;
}
