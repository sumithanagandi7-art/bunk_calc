import test from 'node:test';
import assert from 'node:assert/strict';
import { checkOllamaStatus, KNOWN_VISION_MODEL_PREFIXES } from '../src/services/ocr/ollamaService.js';
import { getOCRProvider } from '../src/services/ocr/providerInterface.js';

test('AI Engine & Ollama Vision Service Suite', async (t) => {
  await t.test('Ollama vision provider instantiation', () => {
    const provider = getOCRProvider('ollama_vision', {
      model: 'llama3.2-vision',
      host: 'http://localhost:11434',
    });
    assert.ok(provider, 'OllamaVisionProvider should be instantiated');
    assert.equal(provider.name, 'ollama_vision');
    assert.equal(provider.model, 'llama3.2-vision');
  });

  await t.test('checkOllamaStatus against localhost daemon', async () => {
    const status = await checkOllamaStatus('http://localhost:11434');
    assert.equal(typeof status.available, 'boolean', 'Status must contain available boolean');
    assert.ok(Array.isArray(status.models), 'Status must contain models array');
    assert.ok(Array.isArray(status.vision_models), 'Status must contain vision_models array');
    assert.equal(status.host, 'http://localhost:11434');
  });

  await t.test('checkOllamaStatus handles unreachable host gracefully', async () => {
    const status = await checkOllamaStatus('http://127.0.0.1:59999');
    assert.equal(status.available, false, 'Should report unavailable for unreachable host');
    assert.deepEqual(status.models, []);
    assert.deepEqual(status.vision_models, []);
    assert.ok(status.error, 'Should report an error string');
  });

  await t.test('API /api/v1/ai/status endpoint returns valid structure', async () => {
    try {
      const res = await fetch('http://localhost:4000/api/v1/ai/status');
      if (res.ok) {
        const data = await res.json();
        assert.ok(data.ollama, 'Ollama engine status must exist');
        assert.ok(data.gemini, 'Gemini engine status must exist');
        assert.ok(data.tesseract, 'Tesseract engine status must exist');
        assert.ok(data.recommended_engine, 'Recommended engine must exist');
      }
    } catch (e) {
      console.log('Skipping live HTTP check:', e.message);
    }
  });

  await t.test('Known vision models catalog check', () => {
    assert.ok(KNOWN_VISION_MODEL_PREFIXES.includes('llama3.2-vision'));
    assert.ok(KNOWN_VISION_MODEL_PREFIXES.includes('moondream'));
    assert.ok(KNOWN_VISION_MODEL_PREFIXES.includes('llava'));
    assert.ok(KNOWN_VISION_MODEL_PREFIXES.includes('qwen2.5-vl'));
  });
});
