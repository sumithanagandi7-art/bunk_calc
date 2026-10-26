/**
 * Normalizes raw portal text into standardized Bunk Calculator data structures.
 */

const Normalizer = {
  /**
   * Normalizes raw status string to 'present' | 'absent' | 'condoned'
   */
  normalizeStatus(rawStatus) {
    if (!rawStatus) return 'present';
    const s = String(rawStatus).trim().toLowerCase();

    if (['p', 'present', 'attended', '1', 'yes', 'y', 'present/attended'].includes(s)) {
      return 'present';
    }
    if (['a', 'absent', 'missed', '0', 'no', 'n', 'absent/missed'].includes(s)) {
      return 'absent';
    }
    if (['c', 'condoned', 'od', 'duty', 'exempt', 'leave', 'on duty'].includes(s)) {
      return 'condoned';
    }

    // Default heuristics
    if (s.startsWith('p') || s.startsWith('att')) return 'present';
    if (s.startsWith('a') || s.startsWith('abs')) return 'absent';
    if (s.startsWith('c') || s.startsWith('od')) return 'condoned';

    return 'present';
  },

  /**
   * Cleans subject code and title from combined text like "22CS51 - Computer Networks"
   */
  normalizeSubject(rawCodeStr, rawNameStr = '') {
    let code = (rawCodeStr || '').trim().toUpperCase();
    let name = (rawNameStr || '').trim();

    // If code string contains hyphens or colons, e.g. "22CS51 - COMPUTER NETWORKS"
    if (code.includes(' - ') || code.includes(': ') || code.includes(' | ')) {
      const parts = code.split(/ - |: | \| /);
      code = parts[0].trim();
      if (!name && parts[1]) {
        name = parts[1].trim();
      }
    }

    // Standard subject code regex check (e.g. 22CS51, CS101, 21CSL54, 22CSA582)
    const codeMatch = code.match(/\b([0-9]{1,2}[A-Z]{2,6}[0-9]{1,4}[A-Z0-9]*|[A-Z]{2,4}\d{3,4})\b/i);
    if (codeMatch) {
      code = codeMatch[1].toUpperCase();
    }

    if (name) {
      name = name
        .replace(/^(?:subject|course)\s*(?:code|name)?\s*[:|-]\s*/i, '')
        .replace(/\b(?:theory|lab|laboratory|lecture)\b/gi, (m) => m.toUpperCase())
        .trim();
    } else {
      name = `Subject ${code}`;
    }

    return {
      subject_code: code || 'SUB',
      subject_name: name || code || 'Subject',
    };
  },

  /**
   * Converts various date formats (DD/MM/YYYY, DD-Mon-YYYY) into strict YYYY-MM-DD
   */
  normalizeDate(rawDateStr) {
    if (!rawDateStr) return new Date().toISOString().split('T')[0];

    const str = String(rawDateStr).trim();

    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

    // DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, '0');
      const month = dmyMatch[2].padStart(2, '0');
      const year = dmyMatch[3];
      return `${year}-${month}-${day}`;
    }

    const timestamp = Date.parse(str);
    if (!isNaN(timestamp)) {
      return new Date(timestamp).toISOString().split('T')[0];
    }

    return new Date().toISOString().split('T')[0];
  }
};

if (typeof window !== 'undefined') {
  window.Normalizer = Normalizer;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Normalizer;
}
