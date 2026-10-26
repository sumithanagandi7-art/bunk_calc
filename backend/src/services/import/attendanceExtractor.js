import { PrismaClient } from '@prisma/client';
import { parsePDFDocument } from './pdfParser.js';
import { parseSpreadsheetDocument } from './spreadsheetParser.js';
import { parseAttendanceStatusWithOCR, parseTimetableWithOCR, parseAttendanceReportTableWithOCR } from '../ocr.js';
import { analyzeDocumentWithLLM } from '../llmService.js';

const prisma = new PrismaClient();

import { executeDocumentPipeline } from '../ocr/pipeline.js';

/**
 * Canonical Attendance Data Schema (v1)
 *
 * Every extraction provider is normalized into this structure:
 * {
 *   schemaVersion: 1,
 *   sourceType: "image" | "pdf" | "spreadsheet",
 *   documentType: "attendance" | "timetable" | "unknown",
 *   subjects: [{
 *     subjectCode: string | null,
 *     subjectName: string | null,
 *     classesHeld: int | null,
 *     classesPresent: int | null,
 *     classesAbsent: int | null,
 *     classesCondoned: int | null,
 *     attendancePercentage: float | null,
 *     confidence: float,
 *     warnings: string[],
 *     matchStatus: "matched_by_code" | "matched_by_name" | "new_subject" | "ambiguous",
 *     matchedSubjectId: string | null,
 *   }],
 *   documentWarnings: string[]
 * }
 */

/**
 * Main Document Extraction & Normalization Service
 */
export async function processAttendanceDocument({
  filePath,
  mimeType,
  originalName,
  workspaceId,
  engine = 'auto',
  ollamaModel = null,
  ollamaHost = null,
}) {
  const ext = (originalName.split('.').pop() || '').toLowerCase();

  let rawExtracted = [];
  let extractionMethod = 'unknown';
  let documentWarnings = [];

  // Execute Document Pipeline for PDFs & Images
  if (ext !== 'xlsx' && ext !== 'csv' && !mimeType.includes('spreadsheet') && !mimeType.includes('excel')) {
    const pipelineRes = await executeDocumentPipeline({
      filePath,
      mimeType,
      documentHint: 'attendance report or timetable',
      engine,
      ollamaModel,
      ollamaHost,
    });

    if (pipelineRes.success && pipelineRes.subjects && pipelineRes.subjects.length > 0) {
      extractionMethod = pipelineRes.method;
      documentWarnings = pipelineRes.warnings || [];

      rawExtracted = pipelineRes.subjects.map((s) => ({
        raw_code: s.subject_code || s.raw_code || null,
        raw_name: s.subject_name || s.raw_name || null,
        faculty_name: s.faculty_name || '',
        attended: s.classes_attended !== undefined ? s.classes_attended :
                  s.presents !== undefined ? s.presents : null,
        absents: s.absents !== undefined ? s.absents : null,
        total: s.total_classes !== undefined ? s.total_classes :
               s.total_classes_planned !== undefined ? s.total_classes_planned : null,
        percentage: s.attendance_percentage,
        confidence_score: s.confidence_score,
        needs_review: s.needs_review || false,
        warnings: s.warnings || [],
      }));

      // If single subject was extracted with 0 presents and 0 absents, cross-verify with table date row counter
      if (rawExtracted.length === 1 && (!rawExtracted[0].attended) && (!rawExtracted[0].absents)) {
        try {
          const ocrCheck = await parseAttendanceStatusWithOCR(filePath);
          if (ocrCheck && (ocrCheck.presents > 0 || ocrCheck.absents > 0)) {
            rawExtracted[0].attended = ocrCheck.presents;
            rawExtracted[0].absents = ocrCheck.absents;
            rawExtracted[0].total = ocrCheck.total_detected || (ocrCheck.presents + ocrCheck.absents);
            if (ocrCheck.subject_code && !rawExtracted[0].raw_code) rawExtracted[0].raw_code = ocrCheck.subject_code;
            if (ocrCheck.subject_name && (!rawExtracted[0].raw_name || rawExtracted[0].raw_name.startsWith('Subject '))) {
              rawExtracted[0].raw_name = ocrCheck.subject_name;
            }
          }
        } catch (_) {}
      }
    } else if (pipelineRes.warnings) {
      documentWarnings.push(...pipelineRes.warnings);
    }
  }

  // Fallback to format-specific parsing
  if (rawExtracted.length === 0) {
    if (ext === 'xlsx' || ext === 'csv' || mimeType.includes('spreadsheet') || mimeType.includes('csv') || mimeType.includes('excel')) {
      const res = await parseSpreadsheetDocument(filePath);
      rawExtracted = (res.rows || []).map(r => ({
        ...r,
        absents: r.absents !== undefined ? r.absents : null,
        warnings: [],
      }));
      extractionMethod = 'spreadsheet_direct';
    } else if (ext === 'pdf' || mimeType.includes('pdf')) {
      const res = await parsePDFDocument(filePath);
      extractionMethod = res.method;

      if (res.text) {
        rawExtracted = parseTextLinesToSubjects(res.text);
      }
      if (rawExtracted.length === 0 && res.presents !== undefined) {
        rawExtracted.push({
          raw_code: null,
          raw_name: 'Attendance Summary',
          attended: res.presents,
          absents: res.absents || null,
          total: (res.presents || 0) + (res.absents || 0) || null,
          percentage: null,
          warnings: ['Single summary extracted from PDF. Individual subjects may not be available.'],
        });
      }
    } else {
      // Image formats (PNG, JPG, JPEG) — fallback OCR methods
      try {
        const ocrTable = await parseAttendanceReportTableWithOCR(filePath);
        if (ocrTable.rows && ocrTable.rows.length > 0) {
          rawExtracted = ocrTable.rows.map(r => ({
            ...r,
            absents: r.absents !== undefined ? r.absents : null,
            warnings: [],
          }));
          extractionMethod = 'ocr_image_table';
        }
      } catch (e) {
        documentWarnings.push(`OCR table extraction failed: ${e.message}`);
      }

      if (rawExtracted.length === 0) {
        try {
          const ocrStatus = await parseAttendanceStatusWithOCR(filePath);
          if (ocrStatus.presents !== null || ocrStatus.absents !== null) {
            rawExtracted.push({
              raw_code: ocrStatus.subject_code || null,
              raw_name: ocrStatus.subject_name || null,
              attended: ocrStatus.presents,
              absents: ocrStatus.absents,
              total: ocrStatus.total_detected || null,
              percentage: null,
              warnings: ['Extracted from single-subject status card. Subject identification may be uncertain.'],
            });
            extractionMethod = 'ocr_status_card';
          }
        } catch (e) {
          documentWarnings.push(`OCR status extraction failed: ${e.message}`);
        }
      }
    }
  }

  // If STILL no subjects extracted, return empty result — do NOT fabricate
  if (rawExtracted.length === 0) {
    return {
      extraction_method: extractionMethod,
      total_extracted: 0,
      subjects: [],
      warnings: [
        ...documentWarnings,
        'No subjects could be extracted from this document. Please try a clearer image or enter data manually.'
      ],
    };
  }

  // Step 2: Fetch existing workspace subjects for matching
  const existingSubjects = await prisma.subject.findMany({
    where: { workspace_id: workspaceId },
    include: { bunk_calculations: true },
  });

  // Step 3: Normalize & Match Subjects
  const normalizedSubjects = [];

  for (let i = 0; i < rawExtracted.length; i++) {
    const raw = rawExtracted[i];
    const rowWarnings = [...(raw.warnings || [])];

    let code = raw.raw_code ? raw.raw_code.toUpperCase().trim() : null;
    let name = raw.raw_name ? raw.raw_name.trim() : null;

    // Parse attendance values — preserve null for missing
    let attended = raw.attended !== null && raw.attended !== undefined ? parseInt(raw.attended, 10) : null;
    let absents = raw.absents !== null && raw.absents !== undefined ? parseInt(raw.absents, 10) : null;
    let total = raw.total !== null && raw.total !== undefined ? parseInt(raw.total, 10) : null;

    if (attended !== null && isNaN(attended)) attended = null;
    if (absents !== null && isNaN(absents)) absents = null;
    if (total !== null && isNaN(total)) total = null;

    // Derive missing where unambiguous
    if (attended !== null && absents !== null && total === null) {
      total = attended + absents;
    } else if (attended !== null && total !== null && absents === null && total >= attended) {
      absents = total - attended;
    } else if (absents !== null && total !== null && attended === null && total >= absents) {
      attended = total - absents;
    }

    // Validate
    if (attended !== null && total !== null && attended > total) {
      rowWarnings.push(`Present (${attended}) > Total (${total}). Possible column swap. Review required.`);
    }

    let percentage = raw.percentage;
    if (percentage !== null && percentage !== undefined && !isNaN(parseFloat(percentage))) {
      percentage = +parseFloat(percentage).toFixed(1);
    } else if (attended !== null && total !== null && total > 0) {
      percentage = +((attended / total) * 100).toFixed(1);
    } else {
      percentage = null;
    }

    // Subject matching
    let matchedSubject = null;
    let matchStatus = 'new_subject';

    if (code) {
      // Exact code match
      matchedSubject = existingSubjects.find(
        (s) => s.subject_code.toUpperCase().trim() === code
      );
      if (matchedSubject) {
        matchStatus = 'matched_by_code';
      }
    }

    if (!matchedSubject && name) {
      // Exact name match (case-insensitive)
      matchedSubject = existingSubjects.find(
        (s) => s.subject_name.toLowerCase().trim() === name.toLowerCase().trim()
      );
      if (matchedSubject) {
        matchStatus = 'matched_by_name';
      }
    }

    if (!matchedSubject && code) {
      // Fuzzy code match — check if code is substring or very similar
      const candidates = existingSubjects.filter(s => {
        const existingCode = s.subject_code.toUpperCase().trim();
        return existingCode.includes(code) || code.includes(existingCode);
      });
      if (candidates.length === 1) {
        matchedSubject = candidates[0];
        matchStatus = 'matched_by_code';
        rowWarnings.push(`Fuzzy code match: "${code}" → "${matchedSubject.subject_code}"`);
      } else if (candidates.length > 1) {
        matchStatus = 'ambiguous';
        rowWarnings.push(`Multiple possible matches for code "${code}": ${candidates.map(c => c.subject_code).join(', ')}`);
      }
    }

    // Confidence evaluation
    let confidence = 'high';
    const needsReview = raw.needs_review || rowWarnings.length > 0;

    if (!code && !name) {
      confidence = 'low';
      rowWarnings.push('Neither subject code nor name could be detected.');
    } else if (attended !== null && total !== null && attended > total) {
      confidence = 'low';
    } else if (rowWarnings.length > 0) {
      confidence = 'medium';
    }

    normalizedSubjects.push({
      subject_code: matchedSubject ? matchedSubject.subject_code : (code || `UNKNOWN_${i + 1}`),
      subject_name: matchedSubject ? matchedSubject.subject_name : (name || (code ? `Subject ${code}` : `Unknown Subject ${i + 1}`)),
      faculty_name: raw.faculty_name || (matchedSubject ? matchedSubject.faculty_name : '') || '',
      classes_attended: attended,
      presents: attended,
      absents: absents,
      total_classes: total,
      attendance_percentage: percentage,
      confidence,
      confidence_score: raw.confidence_score || (confidence === 'high' ? 0.90 : confidence === 'medium' ? 0.70 : 0.50),
      needs_review: needsReview,
      warnings: rowWarnings,
      matched_subject_id: matchedSubject ? matchedSubject.subject_id : null,
      match_status: matchStatus,
    });
  }

  return {
    extraction_method: extractionMethod,
    total_extracted: normalizedSubjects.length,
    subjects: normalizedSubjects,
    warnings: documentWarnings,
  };
}

/**
 * Line scanner to parse text into subject rows
 */
function parseTextLinesToSubjects(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const subjects = [];
  const subjectCodeRegex = /\b(?:[0-9]{2}[A-Z]{2,6}[0-9]{2,4}[A-Z0-9/]*|U[0-9]{2}[A-Z]{2,5}[0-9]{3,4}|[A-Z]{2,4}\s?[-_]?\s?[0-9]{2,4}[A-Z]?)\b/i;

  for (const line of lines) {
    // Skip header-like lines
    if (/subject\s*code|classes\s*attended|attendance\s*percentage|sl\.?\s*no/i.test(line)) continue;
    // Skip total/summary rows
    if (/\b(?:total|average|grand total|overall)\b/i.test(line)) continue;

    const codeMatch = line.match(subjectCodeRegex);
    const nums = (line.match(/\b\d+\b/g) || []).map((n) => parseInt(n, 10)).filter(n => n >= 0 && n < 500);

    if (codeMatch) {
      const code = codeMatch[0].toUpperCase();
      let name = line.replace(codeMatch[0], '').replace(/^[-\s|:]+/, '').trim();
      name = name.replace(/\b\d+(?:\.\d+)?%?\b/g, '').replace(/^[-\s|:]+/, '').trim();

      let attended = null;
      let total = null;
      const filteredNums = nums.filter(n => n > 0);

      if (filteredNums.length >= 2) {
        // Sort to find attended (smaller) and total (larger)
        const sorted = [...filteredNums.slice(0, 2)].sort((a, b) => a - b);
        attended = sorted[0];
        total = sorted[1];
      } else if (filteredNums.length === 1) {
        attended = filteredNums[0];
      }

      subjects.push({
        raw_code: code,
        raw_name: name || `Subject ${code}`,
        attended,
        absents: attended !== null && total !== null ? Math.max(0, total - attended) : null,
        total: total,
        percentage: total && total > 0 && attended !== null ? +((attended / total) * 100).toFixed(1) : null,
        warnings: [],
      });
    }
  }

  return subjects;
}
