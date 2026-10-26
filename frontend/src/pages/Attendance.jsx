import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, ChevronLeft, ChevronRight, Filter, UploadCloud } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar         from '../components/layout/Navbar.jsx';
import Modal          from '../components/ui/Modal.jsx';
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx';
import AnimatedProgressRing from '../components/ui/AnimatedProgressRing.jsx';
import StatusBadge    from '../components/ui/StatusBadge.jsx';
import FileDropzone   from '../components/ui/FileDropzone.jsx';
import AIEngineBadge   from '../components/ui/AIEngineBadge.jsx';
import { useAIEngineStore } from '../store/aiEngineStore.js';
import useSubjects    from '../hooks/useSubjects.js';
import api            from '../lib/api.js';
import { extractWithClientOllama } from '../services/ollamaClient.js';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const getWeekDays = (offset = 0) => {
  const today = new Date();
  const day   = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
};

const MarkAttendanceModal = ({ open, onClose, subjects, selectedSubjectId, onMarked }) => {
  const [form, setForm] = useState({
    subjectId: selectedSubjectId || '',
    date: new Date().toISOString().split('T')[0],
    slot: '',
    status: 'present',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedSubjectId) setForm(f => ({ ...f, subjectId: selectedSubjectId }));
  }, [selectedSubjectId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.subjectId) { toast.error('Select a subject'); return; }
    setLoading(true);
    try {
      await api.post(`/attendance/${form.subjectId}`, {
        class_date: form.date,
        time_slot: form.slot || 'Regular Class',
        status: form.status
      });
      toast.success('Attendance marked!');
      onMarked?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to mark attendance');
    } finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Mark Attendance">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">Subject</label>
          <select value={form.subjectId} onChange={e => setForm(f => ({ ...f, subjectId: e.target.value }))} className="input-field">
            <option value="">Select subject...</option>
            {subjects.map(s => <option key={s.subject_id} value={s.subject_id}>{s.subject_name || s.subject_code}</option>)}
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
              <button key={s} type="button" onClick={() => setForm(f => ({ ...f, status: s }))}
                className={`py-2 rounded-xl text-xs font-bold capitalize border transition-all ${
                  form.status === s
                    ? s === 'present'  ? 'bg-green-100 border-green-200 text-green-700'
                    : s === 'absent'   ? 'bg-red-100 border-red-200 text-red-700'
                    :                   'bg-yellow-100 border-yellow-200 text-yellow-700'
                    : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}>{s}</button>
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

const cleanStr = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const findSubjectMatch = (rawCode, rawName, availableSubjects) => {
  const cCode = cleanStr(rawCode);
  const cName = cleanStr(rawName);

  if (!cCode && !cName) return null;

  // 1. Exact or cleaned code match
  let match = availableSubjects.find(s => {
    const sc = cleanStr(s.subject_code);
    return sc && (sc === cCode || sc === cName);
  });
  if (match) return match;

  // 2. Exact or cleaned name match
  match = availableSubjects.find(s => {
    const sn = cleanStr(s.subject_name);
    return sn && (sn === cName || sn === cCode);
  });
  if (match) return match;

  // 3. Substring match
  match = availableSubjects.find(s => {
    const sc = cleanStr(s.subject_code);
    const sn = cleanStr(s.subject_name);
    return (sc && (cName.includes(sc) || cCode.includes(sc))) ||
           (sn && (cName.includes(sn) || cCode.includes(sn)));
  });
  if (match) return match;

  return null;
};

const AttendanceStatusUpload = ({ subjects, initialSubjectId = '', onSynced }) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingText, setProcessingText] = useState('Analyzing attendance document...');
  const [selectedSubject, setSelectedSubject] = useState(initialSubjectId);
  const [extractedData, setExtractedData] = useState([]);
  const [rawPreview, setRawPreview] = useState('');
  const [showRawText, setShowRawText] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    setSelectedSubject(initialSubjectId || '');
  }, [initialSubjectId]);

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setUploading(false);
    setProgress(0);
    toast.error('Document analysis canceled.');
  };

  const handleAnalyze = async (file) => {
    if (!file) return;

    if (!file.type || !file.type.startsWith('image/')) {
      toast.error('❌ Only a single photo (JPG, JPEG, PNG, WEBP) is allowed.');
      return;
    }

    const { engine, ollamaHost, ollamaModel } = useAIEngineStore.getState();
    setUploading(true);
    setProgress(15);
    setProcessingText(
      engine === 'ollama'
        ? `Connecting to Ollama Local AI (${ollamaModel || 'vision'})...`
        : 'Uploading portal screenshot photo...'
    );

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const fd = new FormData();
    fd.append('file', file);
    fd.append('engine', engine);
    if (ollamaModel) fd.append('ollama_model', ollamaModel);
    if (ollamaHost) fd.append('ollama_host', ollamaHost);

    try {
      let data = null;

    // 1. If engine is 'ollama', try direct client-side extraction on user's device first
    if (engine === 'ollama') {
      try {
        setProcessingText(`Connecting to Ollama Local AI (${ollamaModel || 'vision'})...`);
        setProgress(35);
        data = await extractWithClientOllama({ file, host: ollamaHost, model: ollamaModel });
        setProgress(90);
        setProcessingText('Extracted from photo via Ollama on your device!');
      } catch (clientErr) {
        console.warn('Client-side Ollama direct call notice:', clientErr.message, 'Routing to server backend...');
      }
    }

    // 2. If client Ollama wasn't used or had CORS/network error, route to backend server
    if (!data) {
      setProcessingText(
        engine === 'ollama'
          ? `Routing to backend bridge for Ollama (${ollamaModel || 'vision'})...`
          : 'Extracting presents & absents from photo via Vision AI...'
      );
      const res = await api.post('/attendance/extract-status', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 90000,
        signal: controller.signal,
        onUploadProgress: (evt) => {
          if (evt.total) setProgress(Math.round((evt.loaded * 50) / evt.total));
        },
      });
      data = res.data;
    }

    setProgress(95);

      setTimeout(() => {
        const parsed = data.parsed || data.data || data;
        setRawPreview(parsed.raw_text_preview || '');
        
        const activeSub = selectedSubject ? subjects.find(s => s.subject_id === selectedSubject) : null;
        let rows = [];

        if (parsed.subjects && parsed.subjects.length > 0) {
          // If 1 subject extracted AND user selected a specific subject in dropdown, map directly to selectedSubject
          if (parsed.subjects.length === 1 && activeSub) {
            const s = parsed.subjects[0];
            const p = s.presents !== undefined ? (parseInt(s.presents) || 0) : (parseInt(s.classes_attended) || 0);
            let a = s.absents !== undefined ? (parseInt(s.absents) || 0) : (parseInt(s.classes_absent) || 0);
            if (a === 0 && parseInt(s.total_classes) > p) {
              a = parseInt(s.total_classes) - p;
            }
            rows = [{
              row_id: 'row_0',
              subject_id: activeSub.subject_id,
              subject_name: activeSub.subject_name || activeSub.subject_code,
              presents: p,
              absents: a,
            }];
          } else {
            rows = parsed.subjects.map((s, idx) => {
              const matched = findSubjectMatch(s.subject_code, s.subject_name, subjects);
              const targetSub = matched || (idx === 0 && activeSub ? activeSub : null);
              const p = s.presents !== undefined ? (parseInt(s.presents) || 0) : (parseInt(s.classes_attended) || 0);
              let a = s.absents !== undefined ? (parseInt(s.absents) || 0) : (parseInt(s.classes_absent) || 0);
              if (a === 0 && parseInt(s.total_classes) > p) {
                a = parseInt(s.total_classes) - p;
              }
              return {
                row_id: `row_${idx}`,
                subject_id: targetSub ? targetSub.subject_id : (subjects[idx]?.subject_id || subjects[0]?.subject_id || ''),
                subject_name: targetSub ? (targetSub.subject_name || targetSub.subject_code) : (s.subject_name || s.subject_code || `Subject ${idx + 1}`),
                presents: p,
                absents: a,
              };
            });
          }
        } else {
          // Single summary extraction fallback
          const p = parseInt(parsed.presents) || 0;
          let a = parseInt(parsed.absents) || 0;
          if (a === 0 && parseInt(parsed.total_detected) > p) {
            a = parseInt(parsed.total_detected) - p;
          }
          const targetSub = activeSub || subjects[0];
          rows = [{
            row_id: 'row_0',
            subject_id: targetSub ? targetSub.subject_id : '',
            subject_name: targetSub ? (targetSub.subject_name || targetSub.subject_code) : 'Selected Subject',
            presents: p,
            absents: a,
          }];
        }

        setExtractedData(rows);
        const engineLabel = data.engine_used || (engine === 'ollama' ? 'Ollama Local AI' : 'Vision AI');
        toast.success(`Photo analyzed via ${engineLabel}! Verify & select subjects below.`);
        setReviewOpen(true);
        setUploading(false);
        setProgress(100);
      }, 400);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      toast.error(err.response?.data?.error || 'Unable to identify document. Enter values manually below.');
      setRawPreview('');
      const activeSub = selectedSubject ? subjects.find(s => s.subject_id === selectedSubject) : subjects[0];
      setExtractedData([{
        row_id: 'row_0',
        subject_id: activeSub ? activeSub.subject_id : '',
        subject_name: activeSub ? (activeSub.subject_name || activeSub.subject_code) : 'Selected Subject',
        presents: 0,
        absents: 0,
      }]);
      setReviewOpen(true);
      setUploading(false);
      setProgress(0);
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleUpdateRow = (index, updates) => {
    setExtractedData(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...updates };
      return copy;
    });
  };

  const handleSave = async () => {
    const validStats = extractedData.filter(d => d.subject_id);
    if (validStats.length === 0) {
      toast.error('Please select a valid subject for all rows.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/attendance/bulk-sync', { stats: validStats });
      toast.success('Attendance status synced successfully!');
      setReviewOpen(false);
      onSynced();
    } catch (err) {
      toast.error('Failed to sync attendance status');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="card p-4 sm:p-5 bg-gradient-to-r from-purple-50/70 to-indigo-50/50 border border-purple-100/90 rounded-2xl shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-sm sm:text-base font-extrabold text-gray-900 flex items-center gap-2">
              <UploadCloud size={18} className="text-primary shrink-0" />
              Sync Attendance via Single Photo (Vision AI)
            </h2>
            <p className="text-xs text-gray-500 font-medium">Upload a single attendance portal screenshot photo to auto-count conducted, present, & absent classes.</p>
          </div>
          
          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
            <AIEngineBadge />
            <div className="w-full sm:w-56 shrink-0">
              <select 
                value={selectedSubject} 
                onChange={e => setSelectedSubject(e.target.value)} 
                className="input-field py-1.5 px-3 text-xs bg-white border-purple-200 shadow-xs font-bold text-gray-700"
              >
                <option value="">Auto-Detect All Subjects</option>
                {subjects.map(s => (
                  <option key={s.subject_id} value={s.subject_id}>{s.subject_name || s.subject_code}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <FileDropzone
          onAnalyze={handleAnalyze}
          onCancel={handleCancel}
          isProcessing={uploading}
          progress={progress}
          processingText={processingText}
          actionLabel="Extract Numbers"
          compact={true}
          photoOnly={true}
          acceptHint="Single Photo (JPG, PNG, WEBP)"
        />
      </div>

      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title="Review Extracted Attendance" className="max-w-3xl">
        <p className="text-gray-500 mb-6 text-xs sm:text-sm font-medium">Review the extracted attendance counts. Select the target subject for each row before syncing.</p>
        
        <div className="overflow-x-auto mb-6 border border-gray-100 rounded-2xl p-2 bg-gray-50/50">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-2.5 px-3 font-bold text-gray-500 text-xs uppercase">Target Subject</th>
                <th className="py-2.5 px-3 font-bold text-gray-500 text-xs uppercase">Presents (Attended)</th>
                <th className="py-2.5 px-3 font-bold text-gray-500 text-xs uppercase">Absents (Missed)</th>
                <th className="py-2.5 px-3 font-bold text-gray-500 text-xs uppercase text-center">Total Conducted</th>
              </tr>
            </thead>
            <tbody>
              {extractedData.map((row, i) => {
                const totalConducted = (parseInt(row.presents) || 0) + (parseInt(row.absents) || 0);
                return (
                  <tr key={row.row_id || i} className="border-b border-gray-100 last:border-none bg-white">
                    <td className="py-2.5 px-3">
                      <select 
                        value={row.subject_id} 
                        onChange={e => {
                          const subId = e.target.value;
                          const matchedSub = subjects.find(s => s.subject_id === subId);
                          handleUpdateRow(i, {
                            subject_id: subId,
                            subject_name: matchedSub ? (matchedSub.subject_name || matchedSub.subject_code) : ''
                          });
                        }} 
                        className="input-field py-1.5 px-2.5 text-xs font-bold text-gray-900 border-purple-200 bg-white shadow-xs max-w-[240px]"
                      >
                        <option value="">-- Select Subject --</option>
                        {subjects.map(s => (
                          <option key={s.subject_id} value={s.subject_id}>
                            {s.subject_code} — {s.subject_name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 px-3">
                      <input 
                        type="number" 
                        min="0"
                        value={row.presents} 
                        onChange={e => handleUpdateRow(i, { presents: Math.max(0, parseInt(e.target.value) || 0) })} 
                        className="input-field py-1.5 px-2.5 text-xs max-w-[100px] bg-green-50 text-green-700 font-bold border-green-200" 
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      <input 
                        type="number" 
                        min="0"
                        value={row.absents} 
                        onChange={e => handleUpdateRow(i, { absents: Math.max(0, parseInt(e.target.value) || 0) })} 
                        className="input-field py-1.5 px-2.5 text-xs max-w-[100px] bg-red-50 text-red-700 font-bold border-red-200" 
                      />
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="font-extrabold text-xs text-purple-700 bg-purple-50 px-3 py-1.5 rounded-xl border border-purple-100 inline-block">
                        {totalConducted} classes
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {rawPreview && (
          <div className="mb-6">
            <button 
              type="button" 
              onClick={() => setShowRawText(!showRawText)} 
              className="text-xs font-bold text-primary underline hover:text-purple-700"
            >
              {showRawText ? 'Hide OCR Raw Text' : 'View Detected OCR Text Preview'}
            </button>
            {showRawText && (
              <pre className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-600 whitespace-pre-wrap max-h-40 overflow-y-auto">
                {rawPreview}
              </pre>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <button onClick={() => setReviewOpen(false)} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving && <LoadingSpinner size={16} />} Sync Attendance
          </button>
        </div>
      </Modal>
    </>
  );
};

const Attendance = () => {
  const { subjectId: paramId } = useParams();
  const { subjects, refetch: refetchSubjects } = useSubjects();
  const [weekOffset,  setWeekOffset]  = useState(0);
  const [filterSubject, setFilterSubject] = useState(paramId || '');
  const [records,     setRecords]     = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [markOpen,    setMarkOpen]    = useState(false);

  const weekDays = getWeekDays(weekOffset);
  const today    = new Date();

  // Selected subject details
  const currentSubject = filterSubject ? subjects.find(s => s.subject_id === filterSubject) : null;
  const currentCalc = currentSubject?.bunk_calculations?.find(c => c.checkpoint === 'mse1') || currentSubject?.bunk_calculations?.[0];
  const pct = currentCalc?.current_percentage ?? 0;
  const status = currentCalc?.status || (currentCalc?.classes_total === 0 ? 'safe' : pct >= 75 ? 'safe' : pct >= 60 ? 'tight' : 'at_risk');
  const classesAttended = currentCalc?.classes_attended ?? 0;
  const classesTotal = currentCalc?.classes_total ?? 0;

  const fetchRecords = useCallback(async () => {
    setRecordsLoading(true);
    try {
      const url = filterSubject ? `/attendance/${filterSubject}` : '/attendance';
      const { data } = await api.get(url);
      setRecords(data.records || []);
    } catch { toast.error('Failed to load records'); }
    finally { setRecordsLoading(false); }
  }, [filterSubject]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const handleAttendanceUpdated = () => {
    fetchRecords();
    refetchSubjects();
  };

  const dayHasRecords = (day) => {
    const dayStr = day.toISOString().split('T')[0];
    return records.some(r => {
      if (!r.class_date) return false;
      const rDateStr = new Date(r.class_date).toISOString().split('T')[0];
      return rDateStr === dayStr;
    });
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-24 pb-10 px-4 sm:px-8 max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900">Attendance Portal</h1>
            <p className="text-gray-500 font-medium mt-1">Manage and track your daily class attendance</p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-3 mb-6 bg-white p-3 rounded-2xl shadow-soft border border-gray-100 max-w-sm">
          <Filter size={18} className="text-gray-400" />
          <select
            value={filterSubject}
            onChange={e => setFilterSubject(e.target.value)}
            className="flex-1 bg-transparent border-none text-sm font-bold text-gray-700 outline-none cursor-pointer"
          >
            <option value="">All Subjects Overview</option>
            {subjects.map(s => <option key={s.subject_id} value={s.subject_id}>{s.subject_name || s.subject_code}</option>)}
          </select>
        </div>

        {/* Subject Details (Only shows if a specific subject is selected) */}
        <AnimatePresence mode="wait">
          {currentSubject && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="card p-6 mb-8 flex flex-col md:flex-row items-center gap-8"
            >
              <AnimatedProgressRing percentage={pct} size={100} strokeWidth={8} className="shrink-0" />
              <div className="flex-1 text-center md:text-left">
                <div className="flex flex-col md:flex-row md:items-center gap-3 mb-2 justify-center md:justify-start">
                  <h2 className="text-2xl font-extrabold text-gray-900">{currentSubject.subject_name}</h2>
                  <StatusBadge status={status} />
                </div>
                <p className="text-gray-500 font-medium mb-1">Subject Code: <span className="text-gray-900 font-bold">{currentSubject.subject_code}</span></p>
                <p className="text-gray-500 font-medium">Faculty: <span className="text-gray-900 font-bold">{currentSubject.faculty_name || 'N/A'}</span></p>
              </div>
              
              <div className="bg-purple-50 p-4 rounded-2xl border border-purple-100 w-full md:w-auto text-center">
                <p className="text-sm font-bold text-gray-500 mb-1">Classes Attended</p>
                <p className="text-2xl font-extrabold text-primary">{classesAttended} / {classesTotal}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sync Attendance Status Upload Window (Top Window for Every Subject) */}
        {subjects.length > 0 && (
          <div className="mb-8">
            <AttendanceStatusUpload
              subjects={subjects}
              initialSubjectId={filterSubject}
              onSynced={handleAttendanceUpdated}
            />
          </div>
        )}

        {/* Quick Mark Actions (if subject is selected) */}
        {currentSubject && (
          <div className="mb-8">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Quick Mark Today</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <button
                onClick={async () => {
                  try {
                    await api.post(`/attendance/${filterSubject}`, {
                      class_date: new Date().toISOString().split('T')[0],
                      status: 'present',
                      time_slot: 'Regular Class'
                    });
                    toast.success('Marked Present!');
                    handleAttendanceUpdated();
                  } catch (err) { toast.error(err.response?.data?.message || 'Failed to mark present'); }
                }}
                className="card card-hover p-4 border-2 border-transparent hover:border-green-200 bg-white flex flex-col items-center justify-center gap-2 group"
              >
                <div className="w-12 h-12 rounded-full bg-green-50 text-green-500 flex items-center justify-center font-bold group-hover:scale-110 transition-transform">
                  P
                </div>
                <span className="font-bold text-gray-700">Present</span>
              </button>
              
              <button
                onClick={async () => {
                  try {
                    await api.post(`/attendance/${filterSubject}`, {
                      class_date: new Date().toISOString().split('T')[0],
                      status: 'absent',
                      time_slot: 'Regular Class'
                    });
                    toast.success('Marked Absent!');
                    handleAttendanceUpdated();
                  } catch (err) { toast.error(err.response?.data?.message || 'Failed to mark absent'); }
                }}
                className="card card-hover p-4 border-2 border-transparent hover:border-red-200 bg-white flex flex-col items-center justify-center gap-2 group"
              >
                <div className="w-12 h-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center font-bold group-hover:scale-110 transition-transform">
                  A
                </div>
                <span className="font-bold text-gray-700">Absent</span>
              </button>

              <button
                onClick={() => setMarkOpen(true)}
                className="card card-hover p-4 border-2 border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center gap-2 text-gray-500 hover:text-primary hover:border-purple-200 hover:bg-purple-50 transition-colors"
              >
                <Plus size={24} />
                <span className="font-bold">Custom Entry</span>
              </button>
            </div>
          </div>
        )}

        {/* Week calendar strip */}
        <div className="card p-5 mb-8">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-bold text-gray-500">
              {weekDays[0].toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} –{' '}
              {weekDays[6].toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setWeekOffset(w => w - 1)} className="p-2 rounded-xl bg-gray-50 text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-all border border-gray-100">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => setWeekOffset(0)} className="px-4 py-1.5 rounded-xl bg-gray-50 text-gray-600 font-bold hover:text-gray-900 hover:bg-gray-100 text-xs transition-all border border-gray-100">
                Today
              </button>
              <button onClick={() => setWeekOffset(w => w + 1)} className="p-2 rounded-xl bg-gray-50 text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-all border border-gray-100">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((day, i) => {
              const isToday    = day.toDateString() === today.toDateString();
              const hasRecords = dayHasRecords(day);
              return (
                <div key={i} className={`flex flex-col items-center py-3 rounded-2xl transition-all ${
                  isToday ? 'bg-primary text-white shadow-soft' : 'bg-gray-50 hover:bg-gray-100 text-gray-500'
                }`}>
                  <span className={`text-xs font-bold mb-1 ${isToday ? 'text-white/80' : 'text-gray-400'}`}>{DAYS[i]}</span>
                  <span className={`text-lg font-extrabold ${isToday ? 'text-white' : 'text-gray-900'}`}>
                    {day.getDate()}
                  </span>
                  {hasRecords && (
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 ${isToday ? 'bg-white' : 'bg-primary'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Records table */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Attendance History</h2>
          {!currentSubject && (
            <button onClick={() => setMarkOpen(true)} className="btn-secondary text-sm flex items-center gap-2 py-2 px-4 shadow-sm">
              <Plus size={16} /> Mark Entry
            </button>
          )}
        </div>

        {recordsLoading ? (
          <div className="flex items-center justify-center h-40"><LoadingSpinner size={36} className="text-primary" /></div>
        ) : records.length === 0 ? (
          <div className="card p-12 text-center bg-gray-50 border-dashed border-2 border-gray-200">
            <p className="text-gray-400 font-bold">No attendance records found.</p>
          </div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/50">
                    {['Date', 'Subject', 'Time Slot', 'Status', 'Actions'].map(h => (
                      <th key={h} className="text-left px-6 py-4 text-xs font-bold text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <AnimatePresence>
                    {records.map((r, i) => (
                      <motion.tr
                        key={r.record_id || i}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="hover:bg-gray-50 transition-colors group"
                      >
                        <td className="px-6 py-4 text-sm font-bold text-gray-600">
                          {r.class_date ? new Date(r.class_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-gray-900">
                          {r.subject?.subject_name || r.subject?.subject_code || currentSubject?.subject_name || '—'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 font-medium">{r.time_slot || '—'}</td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold capitalize ${
                            r.status === 'present' ? 'bg-green-100 text-green-700' :
                            r.status === 'absent' ? 'bg-red-100 text-red-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={async () => {
                              try {
                                const subId = r.subject_id || r.subject?.subject_id || filterSubject;
                                if (subId) {
                                  await api.delete(`/attendance/${subId}/${r.record_id}`);
                                } else {
                                  await api.delete(`/attendance/record/${r.record_id}`);
                                }
                                toast.success('Record deleted');
                                await handleAttendanceUpdated();
                              } catch (err) {
                                toast.error(err.response?.data?.message || 'Delete failed');
                              }
                            }}
                            className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all border border-transparent hover:border-red-100 opacity-0 group-hover:opacity-100"
                          >
                            <X size={16} />
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </div>
        )}

      </main>

      <MarkAttendanceModal
        open={markOpen}
        onClose={() => setMarkOpen(false)}
        subjects={subjects}
        selectedSubjectId={filterSubject}
        onMarked={handleAttendanceUpdated}
      />
    </div>
  );
};

export default Attendance;
