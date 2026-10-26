import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import Tesseract from 'tesseract.js';
import fs from 'fs';

dotenv.config();

/**
 * Base Abstract OCRProvider Class
 */
export class OCRProvider {
  constructor(name) {
    this.name = name;
  }

  async extractData({ filePath, mimeType, systemPrompt }) {
    throw new Error(`extractData method not implemented for provider: ${this.name}`);
  }
}

/**
 * Timeout wrapper
 */
function withTimeout(promise, ms = 60000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`API call timed out after ${ms}ms`)), ms)),
  ]);
}

/**
 * Google Gemini Vision API Provider Implementation
 */
export class GeminiVisionProvider extends OCRProvider {
  constructor() {
    super('gemini_vision');
  }

  async extractData({ filePath, mimeType, systemPrompt }) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.LLM_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey || apiKey.length < 5) {
      return { success: false, error: 'No Gemini API key configured.' };
    }

    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, error: 'File not found.' };
    }

    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');
    // Use currently supported active Gemini models
    const modelsToTry = ['gemini-3.6-flash', 'gemini-3.8-flash'];

    for (const modelName of modelsToTry) {
      try {
        const ai = new GoogleGenAI({ apiKey });
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
                    mimeType: mimeType || 'image/png',
                    data: base64Data,
                  },
                },
                { text: systemPrompt },
              ],
            },
          ],
        }), 15000);

        const textResponse = response.text || '';
        const cleanJsonStr = textResponse.replace(/```json/gi, '').replace(/```/g, '').trim();

        let parsed;
        try {
          parsed = JSON.parse(cleanJsonStr);
        } catch (parseErr) {
          console.warn(`Gemini Vision Provider: JSON parse failed (model ${modelName}):`, parseErr.message);
          continue;
        }

        return {
          success: true,
          provider: `gemini_vision (${modelName})`,
          parsed,
          raw_text: textResponse.substring(0, 800),
        };
      } catch (err) {
        console.warn(`Gemini Vision Provider model ${modelName} call failed:`, err.message);

        // Don't try more models on auth errors
        if (err.message?.includes('401') || err.message?.includes('403') || err.message?.includes('API key')) {
          return { success: false, error: `Authentication failed: ${err.message}` };
        }
      }
    }

    return { success: false, error: 'All Gemini Vision models failed or rate-limited.' };
  }
}

/**
 * Tesseract Local OCR Provider Implementation
 */
export class TesseractOCRProvider extends OCRProvider {
  constructor() {
    super('tesseract_ocr');
  }

  async extractData({ filePath }) {
    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, error: 'File not found.' };
    }

    try {
      const worker = await Tesseract.createWorker('eng');

      // Use appropriate PSM for table detection
      await worker.setParameters({
        tessedit_pageseg_mode: '6', // PSM 6: Assume a single uniform block of text (good for tables)
      });

      const ret = await worker.recognize(filePath);
      const text = ret.data.text || '';
      const confidence = ret.data.confidence || 0;
      const words = ret.data.words || [];
      const lines = ret.data.lines || [];
      await worker.terminate();

      return {
        success: text.trim().length > 0,
        provider: 'tesseract_ocr',
        confidence_score: +(confidence / 100).toFixed(2),
        raw_text: text,
        word_count: words.length,
        line_count: lines.length,
        lines: lines.map(l => ({
          text: l.text,
          confidence: l.confidence,
          bbox: l.bbox,
        })),
      };
    } catch (err) {
      console.error('Tesseract OCR Provider error:', err.message);
      return { success: false, error: err.message };
    }
  }
}

import { executePythonOCR } from './pythonOcrService.js';

/**
 * Python OpenCV + Tesseract OCR Provider Implementation
 */
export class PythonOCRProvider extends OCRProvider {
  constructor() {
    super('python_opencv_tesseract');
  }

  async extractData({ filePath }) {
    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, error: 'File not found.' };
    }

    try {
      const res = await executePythonOCR(filePath);
      if (res.success && res.subjects && res.subjects.length > 0) {
        return {
          success: true,
          provider: 'python_opencv_tesseract',
          parsed: {
            document_type: 'timetable',
            subjects: res.subjects.map((s) => ({
              subject_code: s.subject_code,
              subject_name: s.subject_name,
              faculty_name: s.faculty_name,
              total_classes: 40,
              total_classes_planned: 40,
              presents: null,
              absents: null,
              attendance_percentage: null,
            })),
          },
          raw_text: JSON.stringify(res.subjects),
        };
      }
      return { success: false, error: res.error || 'No subjects extracted via Python OCR' };
    } catch (err) {
      console.error('Python OCR Provider error:', err.message);
      return { success: false, error: err.message };
    }
  }
}

import { analyzeDocumentWithOllama } from './ollamaService.js';

/**
 * Ollama Local Multimodal Vision Provider Implementation
 */
export class OllamaVisionProvider extends OCRProvider {
  constructor(model = null, host = null) {
    super('ollama_vision');
    this.model = model;
    this.host = host;
  }

  async extractData({ filePath, mimeType, systemPrompt }) {
    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, error: 'File not found.' };
    }

    try {
      const res = await analyzeDocumentWithOllama({
        filePath,
        mimeType,
        model: this.model,
        host: this.host,
        prompt: systemPrompt,
      });

      if (res.success) {
        return {
          success: true,
          provider: res.method,
          parsed: {
            document_type: res.document_type || 'attendance_report',
            subjects: res.subjects,
            warnings: res.warnings || [],
          },
          raw_text: res.raw_llm_response || '',
        };
      }
      return { success: false, error: res.error || 'Ollama extraction failed' };
    } catch (err) {
      console.error('Ollama Vision Provider error:', err.message);
      return { success: false, error: err.message };
    }
  }
}

/**
 * OCR Provider Factory
 */
export function getOCRProvider(providerName = 'auto', options = {}) {
  if (providerName === 'ollama' || providerName === 'ollama_vision') {
    return new OllamaVisionProvider(options.model, options.host);
  }
  if (providerName === 'python' || providerName === 'python_ocr' || providerName === 'opencv_tesseract') {
    return new PythonOCRProvider();
  }
  if (providerName === 'gemini' || providerName === 'gemini_vision') {
    return new GeminiVisionProvider();
  }
  if (providerName === 'tesseract' || providerName === 'tesseract_ocr') {
    return new TesseractOCRProvider();
  }
  // Default primary provider: Gemini Vision with Tesseract fallback
  return new GeminiVisionProvider();
}
