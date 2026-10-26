import { create } from 'zustand';
import api from '../lib/api.js';

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
    try {
      const { data } = await api.get('/ai/status', { params: { host: ollamaHost } });
      set({ status: data, loading: false });
      if (data.ollama?.recommended_model && !localStorage.getItem('bunkcalc_ollama_model')) {
        set({ ollamaModel: data.ollama.recommended_model });
      }
      return data;
    } catch (err) {
      console.warn('Could not fetch AI status:', err.message);
      set({ loading: false });
      return null;
    }
  },

  testOllamaConnection: async (hostToTest) => {
    const host = hostToTest || get().ollamaHost;
    set({ testingHost: true, testResult: null });
    try {
      const { data } = await api.post('/ai/test-ollama', { host });
      set({
        testingHost: false,
        testResult: {
          success: true,
          latency: data.latency_ms,
          models: data.all_models || [],
          visionModels: data.vision_models || [],
          hasVision: data.has_vision_support,
        },
      });
      // Refresh status
      get().fetchStatus();
      return data;
    } catch (err) {
      const errData = err.response?.data;
      set({
        testingHost: false,
        testResult: {
          success: false,
          error: errData?.error || err.message,
          troubleshooting: errData?.troubleshooting || ['Check that Ollama is running and accessible at ' + host],
        },
      });
      return null;
    }
  },
}));
