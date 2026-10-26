import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, TrendingUp, BookOpen, AlertTriangle, CheckCircle, RefreshCw, ClipboardList, UploadCloud } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar          from '../components/layout/Navbar.jsx';
import SubjectCard     from '../components/ui/SubjectCard.jsx';
import LoadingSpinner  from '../components/ui/LoadingSpinner.jsx';
import Modal           from '../components/ui/Modal.jsx';
import AnimatedProgressRing from '../components/ui/AnimatedProgressRing.jsx';
import useBunk         from '../hooks/useBunk.js';
import useSubjects     from '../hooks/useSubjects.js';
import api             from '../lib/api.js';
import ImportModal     from '../components/ui/ImportModal.jsx';

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const AnimatedNumber = ({ value, duration = 1500 }) => {
  const [display, setDisplay] = useState(0);
  const numVal = typeof value === 'number' ? value : parseFloat(value) || 0;

  useEffect(() => {
    let start = 0;
    const end = numVal;
    const step = end / (duration / 16);
    const interval = setInterval(() => {
      start = Math.min(start + step, end);
      setDisplay(Math.round(start * 10) / 10);
      if (start >= end) clearInterval(interval);
    }, 16);
    return () => clearInterval(interval);
  }, [numVal, duration]);

  return <>{display}</>;
};

const StatCard = ({ icon: Icon, label, value, suffix = '', iconColor = 'text-primary', delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.5 }}
  >
    <div className="card p-5 flex items-center gap-4">
      <div className={`p-3 rounded-2xl bg-gray-50 ${iconColor}`}>
        <Icon size={24} />
      </div>
      <div>
        <p className="text-2xl font-extrabold text-gray-900 leading-none mb-1">
          <AnimatedNumber value={value} />{suffix}
        </p>
        <p className="text-sm font-semibold text-gray-500">{label}</p>
      </div>
    </div>
  </motion.div>
);

const QuickLogModal = ({ open, onClose, subjects, onLogged }) => {
  const [form, setForm] = useState({ subjectId: '', date: new Date().toISOString().split('T')[0], slot: '', status: 'present' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.subjectId) { toast.error('Please select a subject'); return; }
    setLoading(true);
    try {
      await api.post(`/attendance/${form.subjectId}`, {
        class_date: form.date,
        time_slot: form.slot || 'N/A',
        status: form.status
      });
      toast.success('Attendance logged!');
      onLogged?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to log attendance');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Attendance">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">Subject</label>
          <select
            value={form.subjectId}
            onChange={e => setForm(f => ({ ...f, subjectId: e.target.value }))}
            className="input-field"
          >
            <option value="">Select subject...</option>
            {subjects.map(s => (
              <option key={s.subject_id} value={s.subject_id}>{s.subject_name || s.subject_code}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Date</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="input-field" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Time Slot</label>
            <input placeholder="e.g. 9:00 AM" value={form.slot} onChange={e => setForm(f => ({ ...f, slot: e.target.value }))} className="input-field" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">Status</label>
          <div className="grid grid-cols-3 gap-2">
            {['present','absent','condoned'].map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setForm(f => ({ ...f, status: s }))}
                className={`py-2 rounded-xl text-xs font-bold capitalize border transition-all ${
                  form.status === s
                    ? s === 'present'  ? 'bg-green-100 border-green-200 text-green-700'
                    : s === 'absent'   ? 'bg-red-100 border-red-200 text-red-700'
                    :                   'bg-yellow-100 border-yellow-200 text-yellow-700'
                    : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 h-12 mt-2">
          {loading ? <LoadingSpinner size={18} /> : 'Save Entry'}
        </button>
      </form>
    </Modal>
  );
};

const Dashboard = () => {
  const { subjects, loading, refetch: refetchSubjects, deleteSubject } = useSubjects();
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [importOpen,   setImportOpen]   = useState(false);
  const [editSubject,  setEditSubject]  = useState(null);
  
  const overall = (() => {
    let totalAttended = 0;
    let totalClasses = 0;
    subjects.forEach(s => {
      const calc = s.bunk_calculations?.find(c => c.checkpoint === 'mse1') || s.bunk_calculations?.[0];
      if (calc) {
        totalAttended += (calc.classes_attended || 0);
        totalClasses += (calc.classes_total || 0);
      }
    });
    return (totalClasses > 0 && totalAttended > 0) ? (totalAttended / totalClasses) * 100 : 0;
  })();
  
  // Calculate remaining bunks (for simple display)
  const safeCount = subjects.filter(s => {
    const calc = s.bunk_calculations?.find(c => c.checkpoint === 'mse1') || s.bunk_calculations?.[0];
    return calc?.status === 'safe' || (calc?.current_percentage >= 75);
  }).length;
  
  const riskCount = subjects.filter(s => {
    const calc = s.bunk_calculations?.find(c => c.checkpoint === 'mse1') || s.bunk_calculations?.[0];
    return calc?.status === 'at_risk' || (calc?.current_percentage < 60);
  }).length;

  const totalBunksLeft = subjects.reduce((acc, s) => {
    const calc = s.bunk_calculations?.find(c => c.checkpoint === 'mse1') || s.bunk_calculations?.[0];
    return acc + (calc?.bunks_remaining > 0 ? calc.bunks_remaining : 0);
  }, 0);

  const containerVariants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08 } },
  };
  const cardVariants = {
    hidden: { opacity: 0, y: 30 },
    show:   { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-24 pb-20 px-4 sm:px-8 max-w-7xl mx-auto">
        {/* Greeting & Header section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
              {getGreeting()} 👋
            </h1>
            <p className="text-gray-500 font-medium mt-1">
              Here's your attendance overview
            </p>
          </motion.div>
          
          <motion.div
             initial={{ opacity: 0, x: 20 }}
             animate={{ opacity: 1, x: 0 }}
             transition={{ duration: 0.6, delay: 0.2 }}
             className="mt-4 md:mt-0 flex gap-3 items-center"
          >
            <button onClick={() => setImportOpen(true)} className="btn-primary text-sm flex items-center gap-2 py-2.5 px-5 shadow-soft">
              <UploadCloud size={18} /> Import Attendance
            </button>
          </motion.div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <LoadingSpinner size={48} />
          </div>
        ) : (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 mb-12">
              <StatCard icon={BookOpen}      label="Subjects"           value={subjects.length} iconColor="text-purple-500" delay={0} />
              <StatCard icon={TrendingUp}    label="Overall Attendance" value={Math.round(overall)} suffix="%" iconColor="text-emerald-500" delay={0.1} />
              <StatCard icon={CheckCircle}   label="Total Bunks Left"   value={totalBunksLeft}  iconColor="text-blue-500" delay={0.2} />
              <StatCard icon={AlertTriangle} label="At Risk Subjects"   value={riskCount}       iconColor="text-red-500" delay={0.3} />
            </div>

            {/* Subjects grid */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Your Subjects</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => refetchSubjects()}
                  className="p-2.5 rounded-xl text-gray-400 hover:text-gray-900 hover:bg-white border border-transparent hover:border-gray-200 transition-all shadow-sm"
                >
                  <RefreshCw size={18} />
                </button>
                <button onClick={() => setImportOpen(true)} className="btn-secondary text-sm flex items-center gap-2 py-2 px-4 shadow-sm">
                  <UploadCloud size={16} /> Import Attendance
                </button>
                <button onClick={() => setQuickLogOpen(true)} className="btn-secondary text-sm flex items-center gap-2 py-2 px-4 shadow-sm">
                  <ClipboardList size={16} /> Quick Log
                </button>
              </div>
            </div>

            {subjects.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-20 bg-white border border-gray-100 rounded-3xl shadow-sm"
              >
                <div className="w-20 h-20 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-5">
                  <BookOpen size={32} className="text-gray-300" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">No subjects yet</h3>
                <p className="text-gray-500 font-medium mb-6 max-w-sm mx-auto">
                  Add your subjects or upload your timetable to start tracking.
                </p>
                <a href="/subjects" className="btn-primary inline-flex items-center gap-2">
                  <Plus size={18} /> Add Subjects
                </a>
              </motion.div>
            ) : (
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                {subjects.map(subject => (
                  <motion.div key={subject.subject_id} variants={cardVariants}>
                    <SubjectCard
                      subject={subject}
                      onEdit={setEditSubject}
                      onDelete={deleteSubject}
                    />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </>
        )}
      </main>

      <QuickLogModal
        open={quickLogOpen}
        onClose={() => setQuickLogOpen(false)}
        subjects={subjects}
        onLogged={() => { refetchSubjects(); }}
      />

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImportCompleted={() => { refetchSubjects(); }}
      />
    </div>
  );
};

export default Dashboard;
