import express from 'express';
import dotenv from 'dotenv';
import { checkOllamaStatus, isVisionModel } from '../services/ocr/ollamaService.js';
import { authenticate } from '../middleware/auth.js';

dotenv.config();

const router = express.Router();

/**
 * GET /api/v1/ai/status
 * Return current availability for Gemini Vision, Ollama Local AI, and Tesseract OCR.
 */
router.get('/status', async (req, res) => {
  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.LLM_API_KEY || process.env.GOOGLE_API_KEY;
  const geminiAvailable = Boolean(geminiApiKey && geminiApiKey.length > 5);

  const ollamaHost = req.query.host || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const ollamaStatus = await checkOllamaStatus(ollamaHost);

  res.json({
    gemini: {
      available: geminiAvailable,
      models: ['gemini-3.6-flash', 'gemini-3.8-flash'],
      recommended_model: 'gemini-3.6-flash',
      type: 'cloud',
      label: 'Google Gemini Multimodal Vision',
    },
    ollama: {
      available: ollamaStatus.available,
      host: ollamaStatus.host,
      models: ollamaStatus.models,
      vision_models: ollamaStatus.vision_models,
      recommended_model: ollamaStatus.recommended_model || 'llama3.2-vision',
      error: ollamaStatus.error || null,
      type: 'local',
      label: 'Ollama Local Multimodal AI',
    },
    tesseract: {
      available: true,
      type: 'local_ocr',
      label: 'Local OCR (Tesseract / OpenCV)',
    },
    recommended_engine: geminiAvailable ? 'auto' : (ollamaStatus.available ? 'ollama' : 'auto'),
  });
});

/**
 * POST /api/v1/ai/test-ollama
 * Test connection to an Ollama instance and discover available vision models.
 */
router.post('/test-ollama', async (req, res) => {
  const host = req.body.host || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const t0 = Date.now();
  const status = await checkOllamaStatus(host);
  const latencyMs = Date.now() - t0;

  if (!status.available) {
    return res.status(503).json({
      success: false,
      host: status.host,
      latency_ms: latencyMs,
      error: status.error,
      troubleshooting: [
        'Make sure Ollama is installed and running: run "ollama serve" in your terminal.',
        'Default URL is http://localhost:11434.',
        'To install a vision model, run: "ollama run llama3.2-vision" or "ollama run llava".',
      ],
    });
  }

  res.json({
    success: true,
    host: status.host,
    latency_ms: latencyMs,
    models_count: status.models.length,
    vision_models: status.vision_models,
    all_models: status.models,
    has_vision_support: status.vision_models.length > 0,
    recommended_model: status.recommended_model,
  });
});

export default router;
