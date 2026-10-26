import fs from 'fs';
import { createRequire } from 'module';
import { parseAttendanceStatusWithOCR } from '../ocr.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

/**
 * Extract raw text from PDF files (selectable text or OCR fallback)
 */
export async function parsePDFDocument(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(dataBuffer);
    const text = pdfData?.text || '';

    // If PDF text is reasonably long (> 30 chars), use extracted text directly
    if (text.trim().length >= 30) {
      return {
        text: text.trim(),
        method: 'pdf_text_extraction',
        confidence: 'high',
      };
    }
  } catch (err) {
    console.warn('pdf-parse text extraction failed, falling back to OCR:', err.message);
  }

  // Fallback to OCR if PDF contains no selectable text (scanned PDF)
  const ocrRes = await parseAttendanceStatusWithOCR(filePath);
  return {
    text: ocrRes.raw_text_preview || '',
    method: 'ocr_scanned_pdf',
    confidence: 'medium',
    presents: ocrRes.presents,
    absents: ocrRes.absents,
  };
}
