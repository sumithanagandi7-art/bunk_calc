import { useState } from 'react';
import { Cpu, Cloud, Zap, FileSearch, Settings } from 'lucide-react';
import { useAIEngineStore } from '../../store/aiEngineStore.js';
import AIEngineModal from './AIEngineModal.jsx';

const ENGINE_LABELS = {
  auto: { label: 'Hybrid AI', icon: Zap, color: 'text-purple-600 bg-purple-50 border-purple-200' },
  ollama: { label: 'Ollama Local AI', icon: Cpu, color: 'text-orange-600 bg-orange-50 border-orange-200' },
  gemini: { label: 'Gemini Cloud', icon: Cloud, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  tesseract: { label: 'Classic OCR', icon: FileSearch, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
};

const AIEngineBadge = ({ compact = false, className = '' }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const { engine, testResult } = useAIEngineStore();

  const current = ENGINE_LABELS[engine] || ENGINE_LABELS.auto;
  const Icon = current.icon;
  const isOllamaRunning = testResult?.success;

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border transition-all hover:shadow-xs hover:scale-[1.02] active:scale-[0.98] ${current.color} ${className}`}
        title="Configure AI extraction engine (Gemini, Ollama, Tesseract)"
      >
        <Icon size={13} className="shrink-0" />
        <span>{compact ? current.label.split(' ')[0] : current.label}</span>
        {engine === 'ollama' && (
          <span
            className={`w-1.5 h-1.5 rounded-full ${isOllamaRunning ? 'bg-green-500 animate-pulse' : 'bg-amber-400'}`}
          />
        )}
        <Settings size={11} className="opacity-60 hover:opacity-100 ml-0.5" />
      </button>

      <AIEngineModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
};

export default AIEngineBadge;
