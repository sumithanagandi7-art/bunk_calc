import { create } from 'zustand';
import api from '../lib/api.js';

import { checkBrowserOllamaStatus } from '../services/ollamaClient.js';

export const useAIEngineStore = create((set, get) => ({
  engine: localStorage.getItem('bunkcalc_ai_engine') || 'auto',
  ollamaHost: localStorage.getItem('bunkcalc_ollama_host') || 'http://localhost:11434',
  ollamaModel: localStorage.getItem('bunkcalc_ollama_model') || 'llama3.2-vision',
  status: null,
  loading: false,
  testingHost: false,
  testResult: null,

  setEngine: (engine) => {
    localStorage.setItem('bunkcalc_ai_engine', engine);
    set({ engine });
  },

  setOllamaHost: (host) => {
    localStorage.setItem('bunkcalc_ollama_host', host);
    set({ ollamaHost: host });
  },

  setOllamaModel: (model) => {
    localStorage.setItem('bunkcalc_ollama_model', model);
    set({ ollamaModel: model });
  },

  fetchStatus: async () => {
    const { ollamaHost } = get();
    set({ loading: true });

    // Check direct browser connectivity to user's local Ollama instance
    const browserCheck = await checkBrowserOllamaStatus(ollamaHost);

    try {
      const { data } = await api.get('/ai/status', { params: { host: ollamaHost } });
      if (browserCheck.available) {
        data.ollama = {
          ...data.ollama,
          available: true,
          mode: 'direct_browser',
          models: browserCheck.models,
          vision_models: browserCheck.vision_models,
          recommended_model: browserCheck.recommended_model,
        };
      }
      set({ status: data, loading: false });
      if (data.ollama?.recommended_model && !localStorage.getItem('bunkcalc_ollama_model')) {
        set({ ollamaModel: data.ollama.recommended_model });
      }
      return data;
    } catch (err) {
      console.warn('Could not fetch backend AI status:', err.message);
      if (browserCheck.available) {
        const fallbackStatus = {
          ollama: {
            available: true,
            mode: 'direct_browser',
            models: browserCheck.models,
            vision_models: browserCheck.vision_models,
            recommended_model: browserCheck.recommended_model,
          },
          gemini: { available: false },
          tesseract: { available: true },
        };
        set({ status: fallbackStatus, loading: false });
        return fallbackStatus;
      }
      set({ loading: false });
      return null;
    }
  },

  testOllamaConnection: async (hostToTest) => {
    const host = (hostToTest || get().ollamaHost || 'http://localhost:11434').replace(/\/+$/, '');
    set({ testingHost: true, testResult: null });

    // 1. Direct In-Browser check (fastest, connects directly from user laptop to local Ollama)
    try {
      const browserRes = await checkBrowserOllamaStatus(host);
      if (browserRes.available) {
        const result = {
          success: true,
          mode: 'direct_browser',
          latency: 25,
          models: browserRes.models || [],
          visionModels: browserRes.vision_models || [],
          hasVision: (browserRes.vision_models || []).length > 0,
          recommended_model: browserRes.recommended_model,
        };
        set({
          testingHost: false,
          testResult: result,
          ollamaModel: result.recommended_model || get().ollamaModel,
        });
        return result;
      }
    } catch (browserErr) {
      console.log('Direct browser check notice:', browserErr.message);
    }

    // 2. Server bridge check (when running locally or with public tunnel)
    try {
      const { data } = await api.post('/ai/test-ollama', { host });
      set({
        testingHost: false,
        testResult: {
          success: true,
          mode: 'backend_bridge',
          latency: data.latency_ms,
          models: data.all_models || [],
          visionModels: data.vision_models || [],
          hasVision: data.has_vision_support,
        },
      });
      return data;
    } catch (err) {
      const errData = err.response?.data;
      set({
        testingHost: false,
        testResult: {
          success: false,
          error: errData?.error || 'Could not connect to Ollama at ' + host,
          troubleshooting: [
            'Make sure Ollama is running on your machine: "ollama serve".',
            'To allow web browsers to access local Ollama, enable CORS: set environment variable OLLAMA_ORIGINS="*" before starting Ollama.',
            'To pull a fast vision model: run "ollama run llama3.2-vision" or "ollama run moondream".',
          ],
        },
      });
      return null;
    }
  },
}));
