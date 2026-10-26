import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { calculateFileHash, getCachedOCRResult, setCachedOCRResult } from './cacheService.js';
import { analyzeImageQuality } from './qualityAnalyzer.js';
import { generatePreprocessingVariants } from './preprocessor.js';
import { getOCRProvider } from './providerInterface.js';
import { detectTableStructure } from './tableDetector.js';
import { validateAndScoreSubject } from './validator.js';

const require = createRequire(import.meta.url);
let pdfParse = null;
try {
  pdfParse = require('pdf-parse');
} catch (_) {}

// Schema version for cache invalidation
const EXTRACTION_SCHEMA_VERSION = '2.0.0';

/**
 * Document Extraction Pipeline Orchestrator
 *
 * Steps:
 * 1. Cache check (with schema version)
 * 2. File type detection
 * 3. PDF text extraction (for digital PDFs)
 * 4. Image quality analysis
 * 5. Gemini Vision extraction (primary)
 * 6. Tesseract OCR extraction (fallback)
 * 7. Table structure detection
 * 8. Validation & scoring
 * 9. Cache result
 */
export async function executeDocumentPipeline({
  filePath,
  mimeType,
  documentHint = 'auto',
  engine = 'auto',
  ollamaModel = null,
  ollamaHost = null,
}) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      success: false,
      error: 'File not found.',
      subjects: [],
      quality: { quality: 'unknown' },
    };
  }

  // Step 1: Cache check with schema version
  const fileHash = calculateFileHash(filePath);
  const cacheKey = `${fileHash}_v${EXTRACTION_SCHEMA_VERSION}_${engine}_${ollamaModel || 'default'}`;
  const cachedResult = getCachedOCRResult(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }

  // Step 2: File Type Detection & Mime Normalization
  const ext = path.extname(filePath).toLowerCase();
  let actualMime = mimeType || 'image/png';
  if (ext === '.pdf') actualMime = 'application/pdf';
  else if (ext === '.jpg' || ext === '.jpeg') actualMime = 'image/jpeg';
  else if (ext === '.png') actualMime = 'image/png';
  else if (ext === '.webp') actualMime = 'image/webp';

  // Step 3: PDF Selectable Text Extraction
  let digitalPdfText = '';
  if (ext === '.pdf' && pdfParse) {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);
      if (pdfData && pdfData.text && pdfData.text.trim().length > 30) {
        digitalPdfText = pdfData.text.trim();
      }
    } catch (_) {}
  }

  // If digital PDF text exists, extract table directly
  if (digitalPdfText) {
    const tableRes = detectTableStructure(digitalPdfText);
    if (tableRes.rows && tableRes.rows.length > 0) {
      const validatedSubjects = tableRes.rows
        .filter(r => !r.is_summary_row)
        .map((r) => validateAndScoreSubject(r, 2));

      const finalResult = {
        success: true,
        method: 'pdf_selectable_text_direct',
        file_hash: fileHash,
        document_type: 'attendance_report',
        quality: { quality: 'excellent', resolution: 'PDF Vector' },
        total_extracted: validatedSubjects.length,
        subjects: validatedSubjects,
        average_confidence: computeAvgConfidence(validatedSubjects),
        warnings: tableRes.warnings || [],
        header_detected: tableRes.headerDetected,
      };
      setCachedOCRResult(cacheKey, finalResult);
      return finalResult;
    }
  }

  // Step 4: Image Quality Analysis
  const qualityAnalysis = await analyzeImageQuality(filePath);

  // Step 5: Generate Preprocessing Variants (metadata only for now)
  const variants = await generatePreprocessingVariants(filePath, qualityAnalysis);

  // System prompt for Gemini vision
  const systemPrompt = `You are an expert academic document parser for college attendance and timetable systems.
Analyze the uploaded document carefully and extract ALL subjects.

TIMETABLE / CLASS SCHEDULE DOCUMENTS:
College timetables typically have TWO sections:
1. Top section: Weekly schedule grid showing days (Monday-Saturday) and time periods with short codes or initials.
2. Bottom section: A detailed SUBJECT DETAILS / LEGEND TABLE with columns:
   "SUBJECT CODE", "SUBJECT NAME", "SUBJECT INITIALS", "FACULTY NAME", "CLASSROOM / LAB", "E-MAIL ID".
YOU MUST READ AND EXTRACT EVERY ROW FROM THE BOTTOM SUBJECT DETAILS / LEGEND TABLE!
- subject_code: The code (e.g. 22CS51, 22CS52, 22CSL54, 22CSE552, 22CSE553, 22CSE554, 22CSE555, 22CSE556, 22CSE557, 22RM57, 22CSA581, 22CSA582, 22CSA583, 22CSG59, 22CS58, 22CSO56X, 22IN55/ISP5/22IY5, PPL, LA/PD)
- subject_name: The FULL subject name from the "SUBJECT NAME" column (e.g. "Computer Networks", "Theory Of Computation", "5G Mobile Communication", "Data science Using Python", "DevOps Essentials with Docker & Kubernetes", "Internet of Things", "Quantum Computing", "Research Methodology", "Programming MATLAB Fundamentals", "UI / UX LAB", "Tool Based Software Testing", "Computational Statistics", "Interview Preparedness Course", "Placement Practice Lab", etc.)
- faculty_name: The teacher/professor name from "FACULTY NAME"
- For timetables where attendance is not shown, set presents: null, absents: null, total_classes: 40.

RETURN ONLY valid JSON with this structure:
{
  "document_type": "attendance_report" | "timetable" | "unknown",
  "subjects": [
    {
      "subject_code": "String or null",
      "subject_name": "String or null",
      "faculty_name": "String or null",
      "presents": Integer or null,
      "absents": Integer or null,
      "total_classes": Integer or null,
      "attendance_percentage": Float or null
    }
  ],
  "warnings": ["String"],
  "column_headers_detected": ["String"]
}

RULES:
1. Extract exact values from the document. Do NOT invent or guess values.
2. Extract the actual full subject name from the Subject Name column, NOT from day names or period names.
3. Preserve subject codes exactly as shown.
4. Extract all elective and lab subjects listed in the timetable legend table.
5. If a value cannot be read, set it to null.`;

  // Step 6: Multi-Pass Provider Extraction
  let visionSubjects = [];
  let tesseractSubjects = [];
  let extractionMethod = 'unknown';
  let visionWarnings = [];
  let tesseractWarnings = [];
  let allWarnings = [];

  // Pass 1: Vision Model (Ollama or Gemini)
  if (engine === 'ollama') {
    const ollamaProvider = getOCRProvider('ollama_vision', { model: ollamaModel, host: ollamaHost });
    const ollamaRes = await ollamaProvider.extractData({
      filePath,
      mimeType: actualMime,
      systemPrompt,
    });
    if (ollamaRes.success && ollamaRes.parsed?.subjects && ollamaRes.parsed.subjects.length > 0) {
      extractionMethod = ollamaRes.provider;
      visionSubjects = ollamaRes.parsed.subjects;
      visionWarnings = ollamaRes.parsed.warnings || [];
      allWarnings.push(...visionWarnings);
    }
  } else if (engine === 'gemini' || engine === 'auto') {
    const geminiProvider = getOCRProvider('gemini_vision');
    const geminiRes = await geminiProvider.extractData({
      filePath,
      mimeType: actualMime,
      systemPrompt,
    });

    if (geminiRes.success && geminiRes.parsed?.subjects && geminiRes.parsed.subjects.length > 0) {
      extractionMethod = geminiRes.provider;
      visionSubjects = geminiRes.parsed.subjects;
      visionWarnings = geminiRes.parsed.warnings || [];
      allWarnings.push(...visionWarnings);
    } else if (engine === 'auto') {
      // In auto mode, fallback to Ollama if Gemini failed
      try {
        const ollamaProvider = getOCRProvider('ollama_vision', { model: ollamaModel, host: ollamaHost });
        const ollamaRes = await ollamaProvider.extractData({
          filePath,
          mimeType: actualMime,
          systemPrompt,
        });
        if (ollamaRes.success && ollamaRes.parsed?.subjects && ollamaRes.parsed.subjects.length > 0) {
          extractionMethod = ollamaRes.provider;
          visionSubjects = ollamaRes.parsed.subjects;
          visionWarnings = ollamaRes.parsed.warnings || [];
          allWarnings.push(...visionWarnings);
        }
      } catch (_) {}
    }
  }

  // Pass 2: Python OpenCV + Tesseract OCR (fallback or verification)
  let tesseractRawText = '';
  const shouldRunTesseract = (engine === 'tesseract') || visionSubjects.length === 0 || qualityAnalysis.quality === 'poor';

  if (shouldRunTesseract) {
    // For timetables, run Python OpenCV + Tesseract first
    if (documentHint.includes('timetable') || documentHint === 'auto') {
      try {
        const pythonProvider = getOCRProvider('python_ocr');
        const pyRes = await pythonProvider.extractData({ filePath });
        if (pyRes.success && pyRes.parsed?.subjects && pyRes.parsed.subjects.length > 0) {
          tesseractSubjects = pyRes.parsed.subjects;
          if (visionSubjects.length === 0) {
            extractionMethod = 'python_opencv_tesseract';
          }
        }
      } catch (pyErr) {
        console.warn('Python OCR attempt failed:', pyErr.message);
      }
    }

    if (tesseractSubjects.length === 0) {
      const tesseractProvider = getOCRProvider('tesseract_ocr');
      const tessRes = await tesseractProvider.extractData({ filePath });

      if (tessRes.success && tessRes.raw_text) {
        tesseractRawText = tessRes.raw_text;
        const tableRes = detectTableStructure(tessRes.raw_text);
        if (tableRes.rows && tableRes.rows.length > 0) {
          tesseractSubjects = tableRes.rows;
          tesseractWarnings = tableRes.warnings || [];
          if (visionSubjects.length === 0) {
            extractionMethod = 'tesseract_ocr_table';
            allWarnings.push(...tesseractWarnings);
          }
        }
      }
    }
  }

  // Step 7: Select best result
  let extractedSubjects;

  if (visionSubjects.length > 0 && tesseractSubjects.length > 0) {
    // Both providers returned results — prefer Vision AI but note disagreement
    if (visionSubjects.length !== tesseractSubjects.length) {
      allWarnings.push(`Provider disagreement: Vision AI found ${visionSubjects.length} subjects, Tesseract found ${tesseractSubjects.length}. Using Vision result. Review recommended.`);
    }
    extractedSubjects = visionSubjects;
  } else if (visionSubjects.length > 0) {
    extractedSubjects = visionSubjects;
  } else if (tesseractSubjects.length > 0) {
    extractedSubjects = tesseractSubjects;
    extractionMethod = 'tesseract_ocr_table';
  } else {
    // BOTH providers failed — return honest failure, NOT hardcoded data
    return {
      success: false,
      method: 'extraction_failed',
      file_hash: fileHash,
      document_type: 'unknown',
      quality: qualityAnalysis,
      total_extracted: 0,
      subjects: [],
      average_confidence: 0,
      warnings: ['No subjects could be extracted from this document. The image may be unclear, or the document format may not be supported.'],
      error: 'No subjects could be extracted. Please try a clearer image or a different format.',
    };
  }

  // Step 8: Validation & Confidence Scoring
  const passCount = visionSubjects.length > 0 && tesseractSubjects.length > 0 ? 2 : 1;
  const validatedSubjects = extractedSubjects
    .map((sub) => validateAndScoreSubject(sub, passCount))
    .filter(sub => !sub.is_summary_row); // Filter out detected summary rows

  const avgConfidence = computeAvgConfidence(validatedSubjects);

  const finalResult = {
    success: true,
    method: extractionMethod,
    file_hash: fileHash,
    document_type: extractedSubjects[0]?.document_type || 'attendance_report',
    quality: qualityAnalysis,
    total_extracted: validatedSubjects.length,
    subjects: validatedSubjects,
    average_confidence: avgConfidence,
    warnings: allWarnings,
    raw_ocr_text: tesseractRawText ? tesseractRawText.substring(0, 500) : undefined,
  };

  // Step 9: Cache result
  setCachedOCRResult(cacheKey, finalResult);

  return finalResult;
}

function computeAvgConfidence(subjects) {
  if (!subjects || subjects.length === 0) return 0;
  const total = subjects.reduce((acc, s) => acc + (s.confidence_score || 0), 0);
  return +(total / subjects.length).toFixed(2);
}
