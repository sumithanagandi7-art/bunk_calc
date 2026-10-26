import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, Dices, Key, UserPlus, LogIn } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api.js';
import { useAuthStore } from '../store/authStore.js';
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx';

const Access = () => {
  const [mode, setMode] = useState('login'); // 'login' or 'create'
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated()) navigate('/dashboard');
  }, [isAuthenticated, navigate]);

  const handleGenerateCode = async () => {
    setGenerating(true);
    try {
      const { data } = await api.get('/auth/generate-code');
      setCode(data.access_code || '');
      toast.success('Generated unique code!');
    } catch {
      setCode(`BUNK-${Math.floor(1000 + Math.random() * 9000)}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (trimmed.length < 3) {
      toast.error('Code must be at least 3 characters');
      return;
    }

    setLoading(true);
    try {
      const endpoint = mode === 'create' ? '/auth/create' : '/auth/login';
      const { data } = await api.post(endpoint, { access_code: trimmed });
      
      login(data.token, data.workspace);
      toast.success(mode === 'create' ? 'Unique Workspace Created!' : 'Access Granted!');
      navigate('/dashboard');
    } catch (err) {
      const msg = err.response?.data?.message || (mode === 'create' ? 'Failed to create code' : 'Access denied');
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Form */}
      <div className="flex-1 flex flex-col justify-center px-8 sm:px-16 lg:px-24 bg-white relative">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-md w-full mx-auto"
        >
          <div className="mb-8 text-center sm:text-left">
            <h1 className="text-4xl font-extrabold text-gray-900 mb-2">
              {mode === 'login' ? 'Welcome Back 👋' : 'Create Unique Code 🚀'}
            </h1>
            <p className="text-gray-500 font-medium">
              {mode === 'login'
                ? 'Enter your existing access code to open your account'
                : 'Create a brand new unique access code for your workspace'}
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="bg-gray-100 p-1 rounded-2xl flex gap-1 mb-8">
            <button
              type="button"
              onClick={() => { setMode('login'); setCode(''); }}
              className={`flex-1 py-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                mode === 'login' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <LogIn size={16} /> Existing Code
            </button>
            <button
              type="button"
              onClick={() => { setMode('create'); setCode(''); }}
              className={`flex-1 py-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                mode === 'create' ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <UserPlus size={16} /> Create Unique Code
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-bold text-gray-700">Access Code</label>
                {mode === 'create' && (
                  <button
                    type="button"
                    onClick={handleGenerateCode}
                    disabled={generating}
                    className="text-xs font-bold text-primary hover:text-purple-700 flex items-center gap-1 bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-100 transition-all"
                  >
                    {generating ? <LoadingSpinner size={12} /> : <Dices size={14} />} Auto-Generate Unique
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={mode === 'create' ? 'e.g. BUNK-9482 or MYCODE2025' : 'e.g. DEMO123'}
                  className="input-field shadow-sm pr-10 font-mono font-bold"
                  autoFocus
                />
                <Key size={18} className="absolute right-3.5 top-3.5 text-gray-400" />
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {mode === 'create'
                  ? 'This code must be unique. If it already exists, you will be prompted to pick another.'
                  : 'Enter the code you created previously.'}
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 h-14 text-lg shadow-soft hover:shadow-soft-hover"
            >
              {loading ? <LoadingSpinner size={24} /> : mode === 'create' ? 'Create & Enter' : 'Get In'}
            </button>
          </form>

          <div className="mt-8 relative flex items-center justify-center">
            <div className="absolute border-t border-gray-200 w-full" />
            <span className="relative bg-white px-4 text-xs font-bold text-gray-400 uppercase">
              Skip Smart • Stay Eligible
            </span>
          </div>
        </motion.div>
      </div>

      {/* Right Side - Visual */}
      <div className="hidden lg:flex flex-1 bg-[#111827] relative overflow-hidden items-center justify-center">
        <div className="absolute inset-0 opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9IiNmZmYiLz48L3N2Zz4=')] [background-size:30px_30px]" />
        
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="z-10 text-center transform -rotate-2"
        >
          <div className="font-marker text-6xl md:text-7xl leading-tight text-white space-y-4">
            <div className="text-accent animate-wiggle inline-block">GOOD</div>
            <div>STUDENTS</div>
            <div>PLAN.</div>
            <div className="text-pink-400 animate-wiggle inline-block delay-100">GREAT</div>
            <div>STUDENTS</div>
            <div className="text-primary-400 inline-block">OPTIMIZE!</div>
          </div>
          
          <Sparkles className="absolute -top-12 -left-12 text-accent w-16 h-16 animate-pulse" />
        </motion.div>
      </div>
    </div>
  );
};

export default Access;
