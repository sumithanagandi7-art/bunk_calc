import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { executePythonAttendanceOCR, executePythonOCR } from './pythonOcrService.js';
import { isTimetableDocument } from '../ocr.js';

dotenv.config();

const DEFAULT_OLLAMA_HOST = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const DEFAULT_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || 'llama3.2-vision';

export const KNOWN_VISION_MODEL_PREFIXES = [
  'llama3.2-vision',
  'llava',
  'moondream',
  'qwen2.5-vl',
  'qwen2-vl',
  'minicpm-v',
  'bakllava',
];

/**
 * Timeout wrapper for fetch requests
 */
function withTimeout(promise, ms = 45000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Ollama request timed out after ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * Check if a model name is known to support vision
 */
export function isVisionModel(modelName = '') {
  const lower = modelName.toLowerCase();
  return KNOWN_VISION_MODEL_PREFIXES.some((prefix) => lower.includes(prefix));
}

/**
 * Check Ollama server status and discover installed models
 *
 * @param {string} [host] - custom Ollama URL (default http://localhost:11434)
 * @returns {Promise<{ available: boolean, host: string, models: string[], vision_models: string[], recommended_model: string|null, error?: string }>}
 */
export async function checkOllamaStatus(host = DEFAULT_OLLAMA_HOST) {
  const cleanHost = host.replace(/\/+$/, '');

  try {
    const res = await withTimeout(fetch(`${cleanHost}/api/tags`, { method: 'GET' }), 4000);
    if (!res.ok) {
      return {
        available: false,
        host: cleanHost,
        models: [],
        vision_models: [],
        recommended_model: null,
        error: `Ollama returned HTTP ${res.status}: ${res.statusText}`,
      };
    }

    const data = await res.json();
    const models = Array.isArray(data.models) ? data.models.map((m) => m.name || m.model) : [];
    const visionModels = models.filter((name) => isVisionModel(name));

    let recommended = null;
    if (visionModels.length > 0) {
      recommended = visionModels[0];
    }

    return {
      available: true,
      host: cleanHost,
      models,
      vision_models: visionModels,
      recommended_model: recommended,
    };
  } catch (err) {
    return {
      available: false,
      host: cleanHost,
      models: [],
      vision_models: [],
      recommended_model: null,
      error: `Could not connect to Ollama at ${cleanHost} (${err.message})`,
    };
  }
}

/**
 * Structured document analysis prompt for Ollama Vision
 */
const OLLAMA_VISION_SYSTEM_PROMPT = `You are an expert academic document parsing AI.
Analyze the uploaded document image carefully and extract all subject, attendance, and timetable information.
Notice:
1. For Contineo / college attendance portal screenshots:
   - Identify active subject tab, Subject Code (e.g. 22CSE553), Subject Name (e.g. ETHICAL HACKING), Faculty Name (e.g. DR NALINI N).
   - Look for attendance badges:
     * "PRESENT [19]" or "Present CLASSES 19" -> presents = 19
     * "ABSENT []" or "ABSENT [0]" or empty Absent List table -> absents = 0
     * Count rows in Present list if badge is missing.
2. For Timetable documents:
   - Read the Subject Details / Legend table at the bottom.
   - Extract subject_code, subject_name, faculty_name for each row.
   - Set presents: null, absents: null, total_classes: 40.

RETURN ONLY VALID JSON matching this schema:
{
  "document_type": "attendance_report" | "timetable" | "unknown",
  "subjects": [
    {
      "subject_code": "String",
      "subject_name": "String",
      "faculty_name": "String or null",
      "presents": "Integer or null",
      "absents": "Integer or null",
      "total_classes": "Integer or null",
      "attendance_percentage": "Float or null"
    }
  ],
  "warnings": ["String"]
}`;

/**
 * Analyze an image document with Ollama Vision
 *
 * @param {object} params
 * @param {string} params.filePath - Path to image file
 * @param {string} [params.mimeType] - MIME type of image
 * @param {string} [params.model] - Specific Ollama vision model (e.g. 'llama3.2-vision', 'llava')
 * @param {string} [params.host] - Custom Ollama host URL
 * @param {string} [params.prompt] - Optional custom prompt
 * @returns {Promise<{ success: boolean, method: string, document_type: string, subjects: Array, warnings: Array, raw_llm_response?: string, error?: string }>}
 */
export async function analyzeDocumentWithOllama({
  filePath,
  mimeType = 'image/jpeg',
  model = null,
  host = DEFAULT_OLLAMA_HOST,
  prompt = null,
}) {
  const cleanHost = (host || DEFAULT_OLLAMA_HOST).replace(/\/+$/, '');

  if (!filePath || !fs.existsSync(filePath)) {
    return { success: false, error: 'File not found.', subjects: [], warnings: [] };
  }

  // 1. Determine model: use requested model or check Ollama's available vision models
  let selectedModel = model;
  if (!selectedModel) {
    const status = await checkOllamaStatus(cleanHost);
    if (!status.available) {
      return {
        success: false,
        error: `Ollama is not running at ${cleanHost}. Please start Ollama or switch to Gemini Cloud Vision.`,
        subjects: [],
        warnings: [status.error],
      };
    }

    if (status.vision_models.length > 0) {
      selectedModel = status.vision_models[0];
    } else if (status.models.length > 0) {
      selectedModel = status.models[0];
    } else {
      selectedModel = DEFAULT_VISION_MODEL;
    }
  }

  // 2. Execute OpenCV Computer Vision preprocessing to isolate table crops and count date rows
  const isTimetable = isTimetableDocument({ originalName: filePath, filePath }) || (prompt && prompt.toLowerCase().includes('timetable'));
  let opencvData = null;
  let imageToSend = filePath;
  try {
    if (isTimetable) {
      opencvData = await executePythonOCR(filePath, 'timetable');
    } else {
      opencvData = await executePythonAttendanceOCR(filePath);
    }
    if (opencvData && opencvData.enhanced_crop_path && fs.existsSync(opencvData.enhanced_crop_path)) {
      imageToSend = opencvData.enhanced_crop_path;
    }
  } catch (pyErr) {
    console.warn('OpenCV pre-processing notice:', pyErr.message);
  }

  // Read image as pure base64 (using OpenCV enhanced crop if available)
  const fileBuffer = fs.readFileSync(imageToSend);
  const base64Image = fileBuffer.toString('base64');

  let finalPrompt = prompt || OLLAMA_VISION_SYSTEM_PROMPT;
  if (!isTimetable && opencvData && opencvData.success && (opencvData.presents > 0 || opencvData.absents > 0 || opencvData.subject_code)) {
    finalPrompt = `${finalPrompt}

OPENCV COMPUTER VISION PRE-DETECTION:
- Active Subject Code: ${opencvData.subject_code}
- Subject Name: ${opencvData.subject_name}
- Faculty: ${opencvData.faculty_name}
- Verified Present Classes (counted table date rows): ${opencvData.presents}
- Verified Absent Classes (counted table date rows): ${opencvData.absents}
- Total Classes Conducted: ${opencvData.total_classes}

Visually examine the image crop, confirm the subject and exact counts (${opencvData.presents} present, ${opencvData.absents} absent), and output valid JSON.`;
  }

  // 3. Try /api/chat endpoint first (recommended for multimodal chat models like llama3.2-vision)
  try {
    const chatPayload = {
      model: selectedModel,
      messages: [
        {
          role: 'user',
          content: `${finalPrompt}\n\nIMPORTANT: Output valid JSON only, starting with { and ending with }.`,
          images: [base64Image],
        },
      ],
      stream: false,
      format: 'json',
      options: {
        temperature: 0.1,
      },
    };

    const response = await withTimeout(
      fetch(`${cleanHost}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chatPayload),
      }),
      60000
    );

    if (response.ok) {
      const data = await response.json();
      const rawText = data?.message?.content || '';
      const parsed = cleanAndParseJSON(rawText);

      if (parsed && Array.isArray(parsed.subjects) && parsed.subjects.length > 0) {
        const subjects = parsed.subjects.map(normalizeSubjectCounts);
        if (opencvData && opencvData.presents > 0 && subjects[0].presents === 0) {
          subjects[0].presents = opencvData.presents;
          subjects[0].absents = opencvData.absents;
          subjects[0].classes_attended = opencvData.presents;
          subjects[0].total_classes = opencvData.total_classes;
          if (opencvData.subject_code && (!subjects[0].subject_code || subjects[0].subject_code === 'UNKNOWN')) {
            subjects[0].subject_code = opencvData.subject_code;
          }
          if (opencvData.subject_name && (!subjects[0].subject_name || subjects[0].subject_name === 'Attendance Subject')) {
            subjects[0].subject_name = opencvData.subject_name;
          }
        }

        return {
          success: true,
          method: `ollama_vision (${selectedModel}) + opencv`,
          document_type: parsed.document_type || 'attendance_report',
          subjects,
          warnings: parsed.warnings || [],
          raw_llm_response: rawText.substring(0, 800),
        };
      }
    }
  } catch (chatErr) {
    console.warn(`Ollama /api/chat error with ${selectedModel}:`, chatErr.message);
  }

  // 4. Fallback to /api/generate endpoint (for models like llava, moondream)
  try {
    const generatePayload = {
      model: selectedModel,
      prompt: `${finalPrompt}\n\nOutput valid JSON only:`,
      images: [base64Image],
      stream: false,
      format: 'json',
      options: {
        temperature: 0.1,
      },
    };

    const response = await withTimeout(
      fetch(`${cleanHost}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(generatePayload),
      }),
      60000
    );

    if (response.ok) {
      const data = await response.json();
      const rawText = data?.response || '';
      const parsed = cleanAndParseJSON(rawText);

      if (parsed && Array.isArray(parsed.subjects) && parsed.subjects.length > 0) {
        const subjects = parsed.subjects.map(normalizeSubjectCounts);
        if (opencvData && opencvData.presents > 0 && subjects[0].presents === 0) {
          subjects[0].presents = opencvData.presents;
          subjects[0].absents = opencvData.absents;
          subjects[0].classes_attended = opencvData.presents;
          subjects[0].total_classes = opencvData.total_classes;
          if (opencvData.subject_code && (!subjects[0].subject_code || subjects[0].subject_code === 'UNKNOWN')) {
            subjects[0].subject_code = opencvData.subject_code;
          }
          if (opencvData.subject_name && (!subjects[0].subject_name || subjects[0].subject_name === 'Attendance Subject')) {
            subjects[0].subject_name = opencvData.subject_name;
          }
        }

        return {
          success: true,
          method: `ollama_vision (${selectedModel}) + opencv`,
          document_type: parsed.document_type || 'attendance_report',
          subjects,
          warnings: parsed.warnings || [],
          raw_llm_response: rawText.substring(0, 800),
        };
      }
    }
  } catch (genErr) {
    console.warn(`Ollama /api/generate error with ${selectedModel}:`, genErr.message);
  }

  // 5. If Ollama connection failed or returned unparseable text, return OpenCV's verified attendance data
  if (opencvData && opencvData.success && opencvData.subjects && opencvData.subjects.length > 0) {
    return {
      success: true,
      method: isTimetable ? 'python_opencv_timetable' : 'python_opencv_attendance',
      document_type: isTimetable ? 'timetable' : 'attendance_report',
      subjects: isTimetable
        ? opencvData.subjects.map((s) => ({
            ...s,
            presents: 0,
            absents: 0,
            total_classes: 40,
            total_classes_planned: 40,
          }))
        : opencvData.subjects,
      warnings: ['Extracted via OpenCV High-Precision Computer Vision'],
    };
  }

  return {
    success: false,
    error: `Ollama Vision extraction failed on model ${selectedModel}.`,
    subjects: [],
    warnings: ['No valid subjects detected from image.'],
  };
}

/**
 * Helper to strip markdown backticks and parse JSON
 */
function cleanAndParseJSON(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // Attempt greedy object extraction
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (__) {}
    }
  }
  return null;
}

/**
 * Standardize presents, absents, and total_classes
 */
function normalizeSubjectCounts(s) {
  const p = s.presents !== undefined && s.presents !== null
    ? parseInt(s.presents, 10) || 0
    : s.classes_attended !== undefined && s.classes_attended !== null
    ? parseInt(s.classes_attended, 10) || 0
    : 0;

  const a = s.absents !== undefined && s.absents !== null
    ? parseInt(s.absents, 10) || 0
    : s.classes_absent !== undefined && s.classes_absent !== null
    ? parseInt(s.classes_absent, 10) || 0
    : 0;

  const conducted = p + a;
  const pct = (conducted > 0 && p > 0) ? +((p / conducted) * 100).toFixed(1) : 0;

  return {
    ...s,
    presents: p,
    classes_attended: p,
    absents: a,
    total_classes: conducted,
    attendance_percentage: pct,
  };
}
