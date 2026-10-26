import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Cpu,
  Cloud,
  FileSearch,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from './Modal.jsx';
import LoadingSpinner from './LoadingSpinner.jsx';
import { useAIEngineStore } from '../../store/aiEngineStore.js';

const ENGINES = [
  {
    id: 'auto',
    name: 'Smart Hybrid (Auto)',
    badge: 'Recommended',
    icon: Zap,
    color: 'from-purple-500 to-indigo-600',
    desc: 'Intelligently uses Google Gemini Cloud Vision or falls back to Ollama Local AI & OCR.',
    features: ['Best Extraction Accuracy', 'Zero-setup Fallback', 'Cloud + Local Redundancy'],
  },
  {
    id: 'ollama',
    name: 'Ollama Local Vision AI',
    badge: '100% Private & Offline',
    icon: Cpu,
    color: 'from-amber-500 to-orange-600',
    desc: 'Runs completely on your computer via Ollama. No API keys needed, zero cloud uploads.',
    features: ['100% Private (No data leaves PC)', 'Unlimited Free Extractions', 'Works completely offline'],
  },
  {
    id: 'gemini',
    name: 'Gemini Cloud Vision',
    badge: 'Ultra Fast',
    icon: Cloud,
    color: 'from-blue-500 to-cyan-600',
    desc: 'Google Gemini multimodal vision. High speed cloud extraction for timetables & screenshots.',
    features: ['High-speed cloud processing', 'Gemini 3.6 Flash engine', 'Active Multimodal AI'],
  },
  {
    id: 'tesseract',
    name: 'Classic Local OCR',
    badge: 'Lightweight',
    icon: FileSearch,
    color: 'from-emerald-500 to-teal-600',
    desc: 'Deterministic optical character recognition via Tesseract.js and OpenCV filters.',
    features: ['No AI Model Download Needed', 'Runs on low-end hardware', 'Rule-based table parsing'],
  },
];

const AIEngineModal = ({ open, onClose }) => {
  const {
    engine,
    ollamaHost,
    ollamaModel,
    status,
    testingHost,
    testResult,
    setEngine,
    setOllamaHost,
    setOllamaModel,
    fetchStatus,
    testOllamaConnection,
  } = useAIEngineStore();

  const [tempHost, setTempHost] = useState(ollamaHost);
  const [copiedCmd, setCopiedCmd] = useState(null);

  useEffect(() => {
    if (open) {
      setTempHost(ollamaHost);
      fetchStatus();
      testOllamaConnection(ollamaHost);
    }
  }, [open]);

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(key);
    toast.success('Command copied to clipboard!');
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const handleSelectEngine = (engId) => {
    setEngine(engId);
    toast.success(`Active AI engine set to: ${ENGINES.find((e) => e.id === engId)?.name}`);
  };

  const handleTestConnection = async () => {
    setOllamaHost(tempHost);
    const res = await testOllamaConnection(tempHost);
    if (res?.success) {
      toast.success(`Connected to Ollama! Found ${res.all_models?.length || 0} installed models.`);
    } else {
      toast.error('Could not connect to Ollama. Make sure Ollama is running.');
    }
  };

  const isOllamaConnected = testResult?.success;
  const visionModels = testResult?.visionModels || status?.ollama?.vision_models || [];
  const allModels = testResult?.models || status?.ollama?.models || [];

  return (
    <Modal open={open} onClose={onClose} title="AI Extraction Engine Settings" className="max-w-3xl">
      <div className="space-y-6">
        <div>
          <p className="text-gray-500 text-xs sm:text-sm font-medium">
            Choose how BunkCalc extracts subjects and attendance from your timetable and portal screenshots.
          </p>
        </div>

        {/* Engine Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {ENGINES.map((eng) => {
            const Icon = eng.icon;
            const isSelected = engine === eng.id;

            return (
              <motion.div
                key={eng.id}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => handleSelectEngine(eng.id)}
                className={`cursor-pointer rounded-2xl p-4 border-2 transition-all relative flex flex-col justify-between ${
                  isSelected
                    ? 'border-purple-500 bg-purple-50/50 shadow-md ring-2 ring-purple-200'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${eng.color} text-white flex items-center justify-center shadow-xs`}>
                        <Icon size={16} />
                      </div>
                      <span className="font-extrabold text-sm text-gray-900">{eng.name}</span>
                    </div>
                    {isSelected && (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-primary bg-purple-100 px-2 py-0.5 rounded-full">
                        <CheckCircle2 size={12} /> Active
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-gray-500 font-medium mb-3">{eng.desc}</p>
                </div>

                <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px]">
                  <span className="font-bold text-gray-600">{eng.badge}</span>
                  {eng.id === 'ollama' && (
                    <span className={`font-bold flex items-center gap-1 ${isOllamaConnected ? 'text-green-600' : 'text-amber-600'}`}>
                      <span className={`w-2 h-2 rounded-full ${isOllamaConnected ? 'bg-green-500 animate-pulse' : 'bg-amber-400'}`}></span>
                      {isOllamaConnected ? 'Running' : 'Offline'}
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Ollama Configuration Section */}
        <div className="rounded-2xl border border-orange-200/80 bg-gradient-to-br from-orange-50/60 to-amber-50/40 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu size={18} className="text-orange-600 shrink-0" />
              <h4 className="text-sm font-extrabold text-gray-900">Ollama Local AI Configuration</h4>
            </div>
            <a
              href="https://ollama.com"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-bold text-orange-600 hover:underline flex items-center gap-1"
            >
              ollama.com <ExternalLink size={12} />
            </a>
          </div>

          <p className="text-xs text-gray-600 font-medium">
            Ollama lets you run state-of-the-art vision models completely on your own machine with total privacy.
          </p>

          {/* Host input and test */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="flex-1">
              <label className="block text-[11px] font-bold text-gray-700 mb-1">Ollama Host URL</label>
              <input
                type="text"
                value={tempHost}
                onChange={(e) => setTempHost(e.target.value)}
                placeholder="http://localhost:11434"
                className="input-field text-xs font-mono font-bold bg-white"
              />
            </div>
            <div className="sm:self-end">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testingHost}
                className="btn-secondary h-10 w-full sm:w-auto px-4 text-xs font-bold flex items-center justify-center gap-1.5"
              >
                {testingHost ? <LoadingSpinner size={14} /> : <RefreshCw size={14} />}
                Test Connection
              </button>
            </div>
          </div>

          {/* Connection Status Banner */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                testResult.success
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 size={16} className="text-green-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                {testResult.success ? (
                  <div>
                    <p className="font-bold">✓ Ollama connected successfully ({testResult.latency}ms ping)</p>
                    <p className="mt-0.5 text-[11px]">
                      {allModels.length} models installed. Vision models found: {visionModels.length}.
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="font-bold">Ollama not detected at {tempHost}</p>
                    <p className="mt-0.5 text-[11px]">{testResult.error}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Vision Model Selection */}
          {visionModels.length > 0 ? (
            <div>
              <label className="block text-[11px] font-bold text-gray-700 mb-1">Preferred Vision Model</label>
              <select
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                className="input-field text-xs font-bold bg-white"
              >
                {visionModels.map((m) => (
                  <option key={m} value={m}>
                    {m} (Vision Enabled)
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="bg-white/80 p-3.5 rounded-xl border border-orange-200/80 space-y-2">
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-orange-600 shrink-0" />
                <span className="text-xs font-bold text-gray-800">Install a Vision Model in 1-Click</span>
              </div>
              <p className="text-[11px] text-gray-600">
                To extract images with Ollama, run one of these commands in your Windows terminal:
              </p>

              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between p-2 rounded-lg bg-gray-900 text-gray-100 font-mono text-[11px]">
                  <span>ollama run llama3.2-vision</span>
                  <button
                    type="button"
                    onClick={() => handleCopy('ollama run llama3.2-vision', 'llama')}
                    className="p-1 hover:text-orange-400 transition-colors"
                  >
                    {copiedCmd === 'llama' ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                  </button>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-gray-900 text-gray-100 font-mono text-[11px]">
                  <span>ollama run moondream</span>
                  <button
                    type="button"
                    onClick={() => handleCopy('ollama run moondream', 'moondream')}
                    className="p-1 hover:text-orange-400 transition-colors"
                  >
                    {copiedCmd === 'moondream' ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-gray-500">
                Tip: <code className="font-bold text-gray-700">moondream</code> is ultra-lightweight (only 1.8GB) and runs great even on laptops without a dedicated GPU.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t border-gray-100">
          <button type="button" onClick={onClose} className="btn-primary py-2.5 px-6 text-sm">
            Save & Close
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default AIEngineModal;
