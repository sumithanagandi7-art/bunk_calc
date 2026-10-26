import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
let pdfParse = null;
try {
  pdfParse = require('pdf-parse');
} catch (e) {
  // Ignore if pdf-parse fails to load
}

dotenv.config();

// Timeout wrapper for API calls (15s for snappy fallback)
function withTimeout(promise, ms = 15000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`LLM API call timed out after ${ms}ms`)), ms)),
  ]);
}

import { analyzeDocumentWithOllama } from './ocr/ollamaService.js';

/**
 * Multimodal LLM Document & Vision Analysis Engine
 *
 * Supports Google Gemini Multimodal Vision API & Ollama Local Vision AI (LLaVA / Llama 3.2 Vision / Moondream).
 */
export async function analyzeDocumentWithLLM({
  filePath,
  mimeType,
  documentHint = 'auto',
  engine = 'auto',
  ollamaModel = null,
  ollamaHost = null,
}) {
  dotenv.config();

  if (!filePath || !fs.existsSync(filePath)) {
    return { success: false, subjects: [], calendar: null, error: 'File not found' };
  }

  // 1. If user explicitly selected Ollama Local Vision
  if (engine === 'ollama') {
    const ollamaResult = await analyzeDocumentWithOllama({
      filePath,
      mimeType,
      model: ollamaModel,
      host: ollamaHost,
    });
    if (ollamaResult.success) {
      return ollamaResult;
    }
    return {
      success: false,
      method: 'ollama_vision_failed',
      subjects: [],
      calendar: null,
      error: ollamaResult.error || 'Ollama Vision extraction failed.',
    };
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.LLM_API_KEY || process.env.GOOGLE_API_KEY;

  if (!apiKey || apiKey.length < 5) {
    if (engine === 'auto') {
      const ollamaRes = await analyzeDocumentWithOllama({
        filePath,
        mimeType,
        model: ollamaModel,
        host: ollamaHost,
      });
      if (ollamaRes.success) return ollamaRes;
    }
    return { success: false, subjects: [], calendar: null, error: 'No Gemini API key configured.' };
  }

  // Determine mime type if missing
  let actualMime = mimeType || 'image/png';
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') actualMime = 'application/pdf';
  else if (ext === '.jpg' || ext === '.jpeg') actualMime = 'image/jpeg';
  else if (ext === '.png') actualMime = 'image/png';
  else if (ext === '.webp') actualMime = 'image/webp';

  // Extract raw text for PDFs if digital
  let pdfTextContext = '';
  if (ext === '.pdf' && pdfParse) {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);
      if (pdfData && pdfData.text && pdfData.text.trim().length > 20) {
        pdfTextContext = `EXTRACTED DIGITAL PDF TEXT:\n${pdfData.text.trim().substring(0, 4000)}\n\n`;
      }
    } catch (_) {
      // Continue with visual inline base64 if pdf-parse text extraction fails
    }
  }

  // Read file as Base64 buffer
  const fileBuffer = fs.readFileSync(filePath);
  const base64Data = fileBuffer.toString('base64');

  const systemPrompt = `${pdfTextContext}You are an expert academic document parsing AI for college students.
Analyze the uploaded document image/PDF carefully and extract all subject, attendance, timetable, and academic calendar information into a strict JSON format.

DOCUMENT HINT: ${documentHint}

EXTRACTION INSTRUCTIONS:

1. READ the actual document carefully. Do not infer, guess, or invent missing values.

2. IDENTIFY every visible subject row and preserve the original row order.

3. EXTRACT for each subject:
   - subject_code: The exact subject/course code as shown (e.g. "22CS51", "CS101")
   - subject_name: The full subject/course name as shown
   - faculty_name: Faculty/professor name if visible
   - presents: Number of classes attended/present (integer)
   - absents: Number of classes absent/missed (integer)
   - total_classes: Total classes conducted/held (integer)
   - attendance_percentage: Percentage if explicitly shown (float)

4. DISTINGUISH column meanings from headers and table layout:
   - Do NOT confuse subject codes with subject names
   - Do NOT confuse classes held/conducted with classes attended
   - Do NOT confuse present with absent
   - Do NOT confuse attendance percentage with marks or credits
   - Do NOT confuse timetable periods with attendance totals

5. For ATTENDANCE PORTAL SCREENSHOTS (e.g. Contineo ERP, ERP portals):
   - Look for active tab / selected tab (e.g. "22CSE553" underlined or highlighted in the tab list)
   - Look for Subject Header: Teacher name (e.g. "DR NALINI N") and subject title (e.g. "22CSE553 - ETHICAL HACKING")
   - Attendance Status badges:
     * Green badge: "PRESENT [19]" or "Present CLASSES 19" -> presents = 19
     * Red badge: "ABSENT []" or "ABSENT [0]" or empty "Absent List" -> absents = 0
     * If badge says "ABSENT []" (empty brackets) or "Absent List CLASSES" is empty with no rows, absents MUST be 0!
     * "STILL TO GO [36]" represents remaining planned classes, not absents.
     * Table of rows: e.g. 19 rows of Present entries -> presents = 19.
   - Ratio formats: "18 / 22" means presents=18, total_classes=22, absents=4
   - Explicit counts: "Presents: 28, Absents: 4, Total: 32"
   - ALWAYS return: presents, absents, total_classes = presents + absents.

6. For TIMETABLE / CLASS SCHEDULE documents:
   - College timetables usually have TWO parts:
     a) Top part: A weekly schedule grid with day rows (Monday, Tuesday...) and time periods. Cells in this grid only show short codes or initials (e.g. "22RM57", "22CS58", "CDC", "Mentoring", "Placement Practice Lab").
     b) Bottom part: A comprehensive SUBJECT DETAILS / LEGEND TABLE with columns:
        "SUBJECT CODE", "SUBJECT NAME", "SUBJECT INITIALS", "FACULTY NAME", "CLASSROOM / LAB", "E-MAIL ID".
   - YOU MUST READ AND EXTRACT FROM THIS SUBJECT DETAILS / LEGEND TABLE!
   - For each row in the legend table:
     * subject_code: Extract the code (e.g. "22CS51", "22CS52", "22CSL54", "22CSE552", "22CSE553", "22CSE554", "22CSE555", "22CSE556", "22CSE557", "22RM57", "22CSA581", "22CSA582", "22CSA583", "22CSG59", "22CS58", "22CSO56X", "22IN55/ISP5/22IY5", "PPL", "LA/PD")
     * subject_name: Extract the FULL subject name directly from the "SUBJECT NAME" column (e.g. "Computer Networks", "Theory Of Computation", "Computer Network Lab", "5G Mobile Communication", "Ethical Hacking", "Data science Using Python", "DevOps Essentials with Docker & Kubernetes", "Internet of Things", "Quantum Computing", "Research Methodology", "Programming MATLAB Fundamentals", "UI / UX LAB", "Tool Based Software Testing", "Computational Statistics", "Interview Preparedness Course", "Open Elective -NPTEL", "National Service Scheme/Physical education /Yoga", "Placement Practice Lab", "Learning Assessment / Partial Delivery")
     * faculty_name: Extract the teacher/professor name from "FACULTY NAME" (e.g. "Ms. Monika Singh(MS)", "Dr. Kavitha K K(KKK)", "Mr. R Deepak(RD)", etc.)
     * presents: null
     * absents: null
     * total_classes: 40
     * attendance_percentage: null
   - Extract ALL subjects from the legend table, including elective and lab subjects.

7. For ACADEMIC CALENDARS & IMPORTANT DATES on timetables:
   - Check the header or sidebar (e.g. "IMPORTANT DATES", "ACADEMIC YEAR"):
   - Extract MSE-1 start/end dates (e.g. "18 to 23 Sept 2026" -> 2026-09-18 to 2026-09-23)
   - Extract MSE-2 start/end dates (e.g. "19 to 24 Nov 2026" -> 2026-11-19 to 2026-11-24)
   - Extract End of Classes / Last Working Day (e.g. "24-11-2026" -> 2026-11-24)
   - Extract Semester Label (e.g. "V(F) SEMESTER", "2026-27 (ODD SEMESTER)")

RULES:
- Return null for values that cannot be read reliably
- Do NOT invent subjects, rows, codes, or attendance numbers
- Always prioritize the Subject Name column in the legend table over short initials
- If a column header is unclear, include a warning

OUTPUT: Return ONLY a valid JSON object matching this schema (no markdown, no prose):

{
  "document_type": "attendance_report" | "timetable" | "academic_calendar" | "unknown",
  "subjects": [
    {
      "subject_code": "String or null",
      "subject_name": "String or null",
      "faculty_name": "String or null",
      "presents": "Integer or null",
      "absents": "Integer or null",
      "total_classes": "Integer or null",
      "attendance_percentage": "Float or null"
    }
  ],
  "calendar": {
    "semester_label": "String",
    "checkpoint1_start_date": "YYYY-MM-DD or null",
    "checkpoint1_end_date": "YYYY-MM-DD or null",
    "checkpoint2_start_date": "YYYY-MM-DD or null",
    "checkpoint2_end_date": "YYYY-MM-DD or null",
    "end_of_classes_date": "YYYY-MM-DD or null"
  },
  "warnings": ["String"],
  "column_headers_detected": ["String"]
}
`;

  // Supported Gemini models with fast 12s timeout before graceful fallback
  const modelsToTry = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-3.6-flash'];
  const MAX_RETRIES = 1;

  for (const modelName of modelsToTry) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const timeoutMs = 12000;

        const response = await withTimeout(ai.models.generateContent({
          model: modelName,
          config: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: actualMime,
                    data: base64Data,
                  },
                },
                {
                  text: systemPrompt,
                },
              ],
            },
          ],
        }), timeoutMs);

        const textResponse = response.text || '';
        const cleanJsonStr = textResponse.replace(/```json/gi, '').replace(/```/g, '').trim();

        let parsed;
        try {
          parsed = JSON.parse(cleanJsonStr);
        } catch (parseErr) {
          console.warn(`Gemini response JSON parse failed (model ${modelName}, attempt ${attempt + 1}):`, parseErr.message);
          continue;
        }

        const docType = parsed.document_type || 'unknown';
        const subjects = parsed.subjects || [];
        const calendar = parsed.calendar || null;
        const warnings = parsed.warnings || [];
        const columnHeaders = parsed.column_headers_detected || [];

        return {
          success: true,
          method: `llm_vision_gemini (${modelName})`,
          document_type: docType,
          subjects,
          calendar,
          warnings,
          column_headers_detected: columnHeaders,
          raw_llm_response: textResponse.substring(0, 800),
        };
      } catch (err) {
        const isRateLimit = err.message?.includes('429') || err.message?.includes('quota') || err.message?.includes('rate');
        const isTimeout = err.message?.includes('timed out');
        const isUnavailable = err.message?.includes('503') || err.message?.includes('UNAVAILABLE') || err.message?.includes('high demand');
        console.warn(`Gemini LLM Vision call failed (model ${modelName}, attempt ${attempt + 1}):`, err.message);

        // Don't retry on auth or not-found errors
        if (err.message?.includes('401') || err.message?.includes('403') || err.message?.includes('API key') || err.message?.includes('404')) {
          break;
        }

        // Retry on rate limits, timeouts, and temporary 503 unavailability with backoff
        if ((isRateLimit || isTimeout || isUnavailable) && attempt < MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, (attempt + 1) * 1200));
          continue;
        }
      }
    }
  }

  // If Gemini failed and we are in auto mode, try Ollama before giving up
  if (engine === 'auto') {
    try {
      const ollamaRes = await analyzeDocumentWithOllama({
        filePath,
        mimeType,
        model: ollamaModel,
        host: ollamaHost,
      });
      if (ollamaRes.success && ollamaRes.subjects && ollamaRes.subjects.length > 0) {
        return ollamaRes;
      }
    } catch (_) {}
  }

  // All models failed — return honest failure, NOT hardcoded data
  return {
    success: false,
    method: 'llm_vision_failed',
    subjects: [],
    calendar: null,
    error: 'All Gemini Vision models failed or were rate-limited. The OCR fallback will be attempted.',
  };
}
