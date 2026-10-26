import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Edit2, BookOpen, AlertCircle, UploadCloud, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar         from '../components/layout/Navbar.jsx';
import StatusBadge    from '../components/ui/StatusBadge.jsx';
import Modal          from '../components/ui/Modal.jsx';
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx';
import AnimatedProgressRing from '../components/ui/AnimatedProgressRing.jsx';
import FileDropzone   from '../components/ui/FileDropzone.jsx';
import useSubjects    from '../hooks/useSubjects.js';
import api from '../lib/api.js';

const EMPTY_FORM = { subject_code: '', subject_name: '', faculty_name: '', total_classes_planned: '', presents: '', absents: '' };

const SubjectForm = ({ initial = EMPTY_FORM, onSubmit, loading }) => {
  const [form, setForm] = useState(initial);

  useEffect(() => {
    setForm(initial);
  }, [initial]);

  const patch = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(form); }} className="space-y-4">
      <div>
        <label className="block text-xs font-bold text-gray-700 mb-1.5">Subject Code</label>
        <input required value={form.subject_code} onChange={patch('subject_code')} className="input-field" placeholder="e.g. CS101" />
      </div>
      <div>
        <label className="block text-xs font-bold text-gray-700 mb-1.5">Subject Name</label>
        <input required value={form.subject_name} onChange={patch('subject_name')} className="input-field" placeholder="e.g. Data Structures" />
      </div>
      <div>
        <label className="block text-xs font-bold text-gray-700 mb-1.5">Faculty Name</label>
        <input value={form.faculty_name} onChange={patch('faculty_name')} className="input-field" placeholder="e.g. Dr. Smith" />
      </div>
      <div>
        <label className="block text-xs font-bold text-gray-700 mb-1.5">Total Classes Planned</label>
        <input type="number" required value={form.total_classes_planned} onChange={patch('total_classes_planned')} className="input-field" placeholder="e.g. 60" />
      </div>
      
      <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">Presents (so far)</label>
          <input type="number" value={form.presents} onChange={patch('presents')} className="input-field bg-green-50 text-green-700 font-bold" placeholder="0" />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">Absents (so far)</label>
          <input type="number" value={form.absents} onChange={patch('absents')} className="input-field bg-red-50 text-red-700 font-bold" placeholder="0" />
        </div>
      </div>

      <button type="submit" disabled={loading} className="btn-primary w-full mt-4 flex items-center justify-center gap-2 h-12">
        {loading ? <LoadingSpinner size={18} /> : (initial.subject_code ? 'Save Changes' : 'Add Subject')}
      </button>
    </form>
  );
};

const DeleteConfirm = ({ subject, onConfirm, onCancel, loading }) => (
  <div className="text-center py-2">
    <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
      <AlertCircle size={32} className="text-red-500" />
    </div>
    <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Subject?</h3>
    <p className="text-gray-500 font-medium mb-6">
      Are you sure you want to delete <strong className="text-gray-900">{subject?.subject_name}</strong>?
      All attendance records will be lost.
    </p>
    <div className="flex gap-3">
      <button onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
      <button
        onClick={onConfirm}
        disabled={loading}
        className="flex-1 h-12 rounded-xl bg-red-500 text-white font-bold hover:bg-red-600 transition-all flex items-center justify-center"
      >
        {loading ? <LoadingSpinner size={18} /> : 'Delete'}
      </button>
    </div>
  </div>
);

const TimetableUpload = ({ onExtracted }) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingText, setProcessingText] = useState('Analyzing timetable...');
  const abortControllerRef = useRef(null);

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setUploading(false);
    setProgress(0);
    toast.error('Timetable upload canceled.');
  };

  const handleAnalyze = async (file) => {
    if (!file) return;
    setUploading(true);
    setProgress(15);
    setProcessingText('Uploading timetable file...');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const fd = new FormData();
    fd.append('file', file);

    try {
      const { data } = await api.post('/subjects/timetable-upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 90000,
        signal: controller.signal,
        onUploadProgress: (evt) => {
          if (evt.total) setProgress(Math.round((evt.loaded * 50) / evt.total));
        },
      });

      setProgress(90);
      setProcessingText('Extracting subject schedule with Gemini Vision AI...');

      setTimeout(() => {
        const parsed = data.parsed?.subjects || data.data?.subjects || data.subjects || [];
        if (parsed.length === 0) {
          toast.error('No subjects detected in this timetable. Please ensure the bottom subject table is clear, or add subjects manually.');
        } else {
          toast.success(`Extracted ${parsed.length} subjects! Review details below.`);
          onExtracted(parsed);
        }
        setUploading(false);
        setProgress(100);
      }, 400);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to extract subjects from timetable.');
      setUploading(false);
      setProgress(0);
    } finally {
      abortControllerRef.current = null;
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Upload Timetable / Academic Schedule</h2>
      <p className="text-gray-500 mb-8">Upload your college timetable or academic calendar (PDF, PNG, JPG, JPEG, WEBP). We'll extract subjects automatically.</p>
      
      <div className="grid md:grid-cols-2 gap-8">
        {/* Dropzone */}
        <div>
          <FileDropzone
            onAnalyze={handleAnalyze}
            onCancel={handleCancel}
            isProcessing={uploading}
            progress={progress}
            processingText={processingText}
            actionLabel="Analyze Timetable"
            acceptHint="Supports PDF, PNG, JPG, JPEG, WEBP (Max 10MB)"
          />
        </div>

        {/* Steps */}
        <div className="flex flex-col justify-center space-y-6">
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center font-bold shrink-0">1</div>
            <div>
              <h4 className="font-bold text-gray-900">Upload Timetable</h4>
              <p className="text-sm text-gray-500">PDF, JPG, PNG, WEBP supported</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-purple-100 text-primary flex items-center justify-center font-bold shrink-0">2</div>
            <div>
              <h4 className="font-bold text-gray-900">Gemini Vision AI</h4>
              <p className="text-sm text-gray-500">Document structure & vision extraction</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-yellow-100 text-yellow-600 flex items-center justify-center font-bold shrink-0">3</div>
            <div>
              <h4 className="font-bold text-gray-900">Review & Edit</h4>
              <p className="text-sm text-gray-500">Cross-correct subject names & codes</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold shrink-0"><CheckCircle2 size={16} /></div>
            <div>
              <h4 className="font-bold text-gray-900">Save to BunkCalc</h4>
              <p className="text-sm text-gray-500">Subjects added to your account</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const toISODate = (val) => {
  if (!val) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const p = Date.parse(val);
  if (!isNaN(p)) return new Date(p).toISOString().split('T')[0];
  return '';
};

const CalendarSetup = () => {
  const [form, setForm] = useState({
    semester_label: 'Semester 5',
    checkpoint1_start_date: '',
    checkpoint1_end_date: '',
    checkpoint2_start_date: '',
    checkpoint2_end_date: '',
    end_of_classes_date: ''
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingText, setProcessingText] = useState('Scanning academic calendar...');
  const abortControllerRef = useRef(null);

  // Fetch stored calendar dates on mount
  useEffect(() => {
    let isMounted = true;
    api.get('/calendar').then(({ data }) => {
      if (!isMounted) return;
      const latest = data.latest || (data.calendars && data.calendars[0]);
      if (latest) {
        setForm(f => ({
          ...f,
          semester_label: latest.semester_label || f.semester_label,
          checkpoint1_start_date: toISODate(latest.checkpoint1_start_date) || f.checkpoint1_start_date,
          checkpoint1_end_date: toISODate(latest.checkpoint1_end_date) || f.checkpoint1_end_date,
          checkpoint2_start_date: toISODate(latest.checkpoint2_start_date) || f.checkpoint2_start_date,
          checkpoint2_end_date: toISODate(latest.checkpoint2_end_date) || f.checkpoint2_end_date,
          end_of_classes_date: toISODate(latest.end_of_classes_date) || f.end_of_classes_date,
        }));
      }
    }).catch(() => {});
    return () => { isMounted = false; };
  }, []);

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setUploading(false);
    setProgress(0);
    toast.error('Calendar processing canceled.');
  };

  const handleAnalyzeCalendar = async (file) => {
    if (!file) return;
    setUploading(true);
    setProgress(15);
    setProcessingText('Uploading calendar document...');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const fd = new FormData();
    fd.append('file', file);

    try {
      const { data } = await api.post('/calendar/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        signal: controller.signal,
        onUploadProgress: (evt) => {
          if (evt.total) setProgress(Math.round((evt.loaded * 60) / evt.total));
        },
      });

      setProgress(90);
      setProcessingText('Extracting calendar dates with Gemini Vision AI...');

      setTimeout(() => {
        const parsed = data.parsed || data.data || data;
        const suggested = parsed.suggested || {};
        setForm(f => ({
          ...f,
          semester_label: suggested.semester_label || f.semester_label,
          checkpoint1_start_date: toISODate(suggested.checkpoint1_start_date) || f.checkpoint1_start_date,
          checkpoint1_end_date: toISODate(suggested.checkpoint1_end_date) || f.checkpoint1_end_date,
          checkpoint2_start_date: toISODate(suggested.checkpoint2_start_date) || f.checkpoint2_start_date,
          checkpoint2_end_date: toISODate(suggested.checkpoint2_end_date) || f.checkpoint2_end_date,
          end_of_classes_date: toISODate(suggested.end_of_classes_date) || f.end_of_classes_date,
        }));
        toast.success('Calendar dates extracted! Review below.');
        setUploading(false);
        setProgress(100);
      }, 400);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      toast.error(err.response?.data?.error || 'Unable to identify calendar document. Enter dates below.');
      setUploading(false);
      setProgress(0);
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        checkpoint1_start_date: toISODate(form.checkpoint1_start_date),
        checkpoint1_end_date: toISODate(form.checkpoint1_end_date),
        checkpoint2_start_date: toISODate(form.checkpoint2_start_date),
        checkpoint2_end_date: toISODate(form.checkpoint2_end_date),
        end_of_classes_date: toISODate(form.end_of_classes_date),
      };
      const { data } = await api.post('/calendar/confirm', payload);
      toast.success(data.message || 'Calendar dates saved successfully!');
    } catch (err) {
      console.error('Save calendar error:', err);
      toast.error(err.response?.data?.error || 'Failed to save calendar dates');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Calendar Access Box</h2>
      <p className="text-gray-500 mb-8">Set your academic calendar dates so BunkCalc can calculate your MSE checkpoints correctly.</p>
      
      <div className="mb-6">
        <FileDropzone
          onAnalyze={handleAnalyzeCalendar}
          onCancel={handleCancel}
          isProcessing={uploading}
          progress={progress}
          processingText={processingText}
          actionLabel="Extract Calendar Dates"
          acceptHint="Supports PDF, PNG, JPG, JPEG, WEBP (Max 10MB)"
        />
      </div>

      <div className="card p-6">
        <form onSubmit={handleSave} className="space-y-6">
          <div>
             <label className="block text-sm font-bold text-gray-700 mb-2">Semester Label</label>
             <input value={form.semester_label} onChange={e => setForm({...form, semester_label: e.target.value})} className="input-field" placeholder="e.g. Semester 5" required />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
              <h3 className="font-bold text-primary mb-4">MSE-1 Period</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">Start Date</label>
                  <input type="date" value={form.checkpoint1_start_date} onChange={e => setForm({...form, checkpoint1_start_date: e.target.value})} className="input-field" required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">End Date</label>
                  <input type="date" value={form.checkpoint1_end_date} onChange={e => setForm({...form, checkpoint1_end_date: e.target.value})} className="input-field" required />
                </div>
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
              <h3 className="font-bold text-blue-600 mb-4">MSE-2 Period</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">Start Date</label>
                  <input type="date" value={form.checkpoint2_start_date} onChange={e => setForm({...form, checkpoint2_start_date: e.target.value})} className="input-field" required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">End Date</label>
                  <input type="date" value={form.checkpoint2_end_date} onChange={e => setForm({...form, checkpoint2_end_date: e.target.value})} className="input-field" required />
                </div>
              </div>
            </div>
          </div>
          
          <div>
             <label className="block text-sm font-bold text-gray-700 mb-2">End of Classes</label>
             <input type="date" value={form.end_of_classes_date} onChange={e => setForm({...form, end_of_classes_date: e.target.value})} className="input-field" required />
          </div>

          <button type="submit" disabled={saving} className="btn-primary w-full h-12 flex justify-center items-center gap-2">
            {saving ? <LoadingSpinner size={18} /> : 'Save Calendar Settings'}
          </button>
        </form>
      </div>
    </div>
  );
};

const SUBJECT_TITLE_MAP = {
  '22CS51': 'Computer Networks',
  '22CS52': 'Theory Of Computation',
  '22CSL54': 'Computer Network Lab',
  '22CSE552': '5G Mobile Communication',
  '22CSE553': 'Ethical Hacking',
  '22CSE554': 'Data science Using Python',
  '22CSE555': 'DevOps Essentials with Docker & Kubernetes',
  '22CSE556': 'Internet of Things',
  '22CSE557': 'Quantum Computing',
  '22RM57': 'Research Methodology',
  '22CSA581': 'Programming MATLAB Fundamentals',
  '22CSA582': 'UI / UX LAB',
  '22CSA583': 'Tool Based Software Testing',
  '22CSG59': 'Computational Statistics',
  '22CS58': 'Interview Preparedness Course',
  '22CSO56X': 'Open Elective -NPTEL',
  '22IN55/ISP5/22IY5': 'National Service Scheme/Physical education /Yoga',
  '22ISP5': 'Physical Education',
  '22IPC5': 'Interview Preparedness Course',
  '22CSE551': 'Cloud Computing',
  '22CSE55X': 'Professional Elective 1',
  'PPL': 'Placement Practice Lab',
  'LA/PD': 'Learning Assessment / Partial Delivery',
  'TA/PD': 'Technical Aptitude & Professional Development',
  'AAV15V': 'Activity & Value Added Course',
};

const sanitizeSubjectName = (code, rawName) => {
  const cleanCode = (code || '').toUpperCase().trim();

  // 1. If rawName was extracted and is a valid subject name, prioritize it!
  if (rawName && typeof rawName === 'string') {
    let cleaned = rawName
      .replace(/[\[\]@|\\/{}()]+/g, ' ')
      .replace(/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/gi, '')
      .replace(/\b(?:\d{1,2}:\d{2}(?:\s*to\s*\d{1,2}:\d{2})?|\d{4})\b/gi, '')
      .replace(/\b(?:period\s*\d+|\d+:\d+|sl\.?\s*no|sept|oct|nov|dec|jan|feb|mar|apr|may|jun|jul|aug)\b/gi, '')
      .trim();

    // Trim edge delimiters without regex that confuses Tailwind scanner
    while (cleaned.length > 0 && ' -:|/'.includes(cleaned[0])) cleaned = cleaned.slice(1);
    while (cleaned.length > 0 && ' -:|/'.includes(cleaned[cleaned.length - 1])) cleaned = cleaned.slice(0, -1);
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    if (cleaned && cleaned.length >= 3 && !/(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(cleaned) && !/^(?:subject\s*.*|\d+.*@.*|\d+|=|@|\[|\]|ta\/pd.*|4\s*@.*|\d+\s*sept.*)$/i.test(cleaned)) {
      return cleaned;
    }
  }

  // 2. Only fallback to map if extracted name is empty or noisy
  if (SUBJECT_TITLE_MAP[cleanCode]) {
    return SUBJECT_TITLE_MAP[cleanCode];
  }

  return rawName || (cleanCode ? `Subject ${cleanCode}` : 'Subject');
};

const CrossCorrectModal = ({ open, onClose, extractedData, onSave, onRefetch }) => {
  const [data, setData] = useState(extractedData);
  const [saving, setSaving] = useState(false);

  useEffect(() => { 
    const mapped = (extractedData.length > 0 ? extractedData : []).map((d, i) => {
      const code = (d.subject_code || `SUB${i + 1}`).toString().toUpperCase().trim();
      return {
        subject_code: code,
        subject_name: sanitizeSubjectName(code, d.subject_name),
        faculty_name: d.faculty_name || '',
        total_classes_planned: d.total_classes_planned || 40,
        presents: d.presents !== undefined ? (parseInt(d.presents) || 0) : (parseInt(d.classes_attended) || 0),
        absents: d.absents !== undefined ? (parseInt(d.absents) || 0) : 0,
        confidence_score: d.confidence_score || (d.low_confidence ? 0.70 : 0.95),
        low_confidence: d.low_confidence || false,
        low_confidence_reason: d.low_confidence_reason || null,
      };
    });
    setData(mapped); 
  }, [extractedData]);

  const handleUpdate = (index, field, value) => {
    const newData = [...data];
    newData[index][field] = value;
    setData(newData);
  };

  const handleAddRow = () => {
    setData([
      ...data,
      {
        subject_code: `SUB${data.length + 1}`,
        subject_name: '',
        faculty_name: '',
        total_classes_planned: 40,
        presents: 0,
        absents: 0,
        confidence_score: 0.95,
        low_confidence: false,
      },
    ]);
  };

  const handleRemove = (index) => {
    setData(data.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        subjects: data.map(d => ({
          subject_code: (d.subject_code || 'SUB').trim().toUpperCase(),
          subject_name: d.subject_name || d.subject_code || 'Subject',
          faculty_name: d.faculty_name || '',
          total_classes_planned: parseInt(d.total_classes_planned) || 40,
          presents: parseInt(d.presents) || 0,
          absents: parseInt(d.absents) || 0,
        }))
      };
      await api.post('/subjects/batch', payload);
      toast.success('Subjects saved successfully!');
      if (onRefetch) await onRefetch();
      if (onSave) onSave();
    } catch (err) {
      console.error('Error saving subjects batch:', err);
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to save subjects');
    } finally {
      setSaving(false);
    }
  };

  const hasLowConfidence = data.some(d => d.low_confidence || d.confidence_score < 0.80);

  return (
    <Modal open={open} onClose={onClose} title="Review Extracted Subjects" className="max-w-4xl">
      <p className="text-gray-500 mb-2">Review the subjects found in your timetable. Edit details or add extra subject rows as needed.</p>
      
      {hasLowConfidence && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-medium text-amber-800 flex items-center gap-2">
          <AlertCircle size={16} className="text-amber-600 shrink-0" />
          <span>Some attendance or subject values require verification (highlighted below). Please review before saving.</span>
        </div>
      )}

      <div className="overflow-x-auto mb-4 max-h-[50vh]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-3 font-bold text-gray-500 text-sm">Code</th>
              <th className="py-3 font-bold text-gray-500 text-sm">Subject Name</th>
              <th className="py-3 font-bold text-gray-500 text-sm">Faculty</th>
              <th className="py-3 font-bold text-gray-500 text-sm">Planned</th>
              <th className="py-3 font-bold text-gray-500 text-sm">Presents</th>
              <th className="py-3 font-bold text-gray-500 text-sm">Absents</th>
              <th className="py-3 font-bold text-gray-500 text-sm">Confidence</th>
              <th className="py-3 font-bold text-gray-500 text-sm"></th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-2 pr-2"><input value={row.subject_code} onChange={e => handleUpdate(i, 'subject_code', e.target.value)} className={`input-field py-2 text-sm w-24 ${row.low_confidence ? 'border-amber-400 bg-amber-50/40' : ''}`} placeholder="CS101" /></td>
                <td className="py-2 pr-2"><input value={row.subject_name} onChange={e => handleUpdate(i, 'subject_name', e.target.value)} className={`input-field py-2 text-sm min-w-[140px] ${row.low_confidence ? 'border-amber-400 bg-amber-50/40' : ''}`} placeholder="Subject Name" /></td>
                <td className="py-2 pr-2"><input value={row.faculty_name} onChange={e => handleUpdate(i, 'faculty_name', e.target.value)} className="input-field py-2 text-sm w-28" placeholder="Faculty" /></td>
                <td className="py-2 pr-2"><input type="number" min="1" value={row.total_classes_planned} onChange={e => handleUpdate(i, 'total_classes_planned', e.target.value)} className="input-field py-2 text-sm w-20" /></td>
                <td className="py-2 pr-2"><input type="number" min="0" value={row.presents} onChange={e => handleUpdate(i, 'presents', e.target.value)} className="input-field py-2 text-sm w-20 bg-green-50 text-green-700 font-bold" /></td>
                <td className="py-2 pr-2"><input type="number" min="0" value={row.absents} onChange={e => handleUpdate(i, 'absents', e.target.value)} className="input-field py-2 text-sm w-20 bg-red-50 text-red-700 font-bold" /></td>
                <td className="py-2 pr-2">
                  <span className={`px-2 py-1 rounded-md text-[11px] font-bold ${row.confidence_score >= 0.80 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                    {Math.round(row.confidence_score * 100)}%
                  </span>
                </td>
                <td className="py-2">
                  <button onClick={() => handleRemove(i)} className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center pt-4 border-t border-gray-100">
        <button type="button" onClick={handleAddRow} className="btn-secondary text-sm flex items-center gap-1 py-2 px-3">
          <Plus size={16} /> Add Subject Row
        </button>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving && <LoadingSpinner size={16} />} Save Subjects
          </button>
        </div>
      </div>
    </Modal>
  );
};

const Subjects = () => {
  const { subjects, loading, addSubject, deleteSubject, updateSubject, refetch } = useSubjects();
  const [activeTab, setActiveTab] = useState('subjects');
  
  const [addOpen,     setAddOpen]     = useState(false);
  const [editSubject, setEditSubject] = useState(null);
  const [delSubject,  setDelSubject]  = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  
  const [extractedData, setExtractedData] = useState([]);
  const [crossCorrectOpen, setCrossCorrectOpen] = useState(false);

  const handleAdd = async (form) => {
    setActionLoading(true);
    try {
      const p = parseInt(form.presents) || 0;
      const a = parseInt(form.absents) || 0;

      await addSubject({
        subject_code: form.subject_code,
        subject_name: form.subject_name,
        faculty_name: form.faculty_name,
        total_classes_planned: parseInt(form.total_classes_planned) || 0,
        presents: p,
        absents: a,
      });

      await refetch();
      setAddOpen(false);
    } catch (err) {
      console.error('Error adding subject:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEdit = async (form) => {
    setActionLoading(true);
    try {
      await updateSubject(editSubject.subject_id, {
        subject_code: form.subject_code,
        subject_name: form.subject_name,
        faculty_name: form.faculty_name,
        total_classes_planned: parseInt(form.total_classes_planned) || 0,
        presents: parseInt(form.presents) || 0,
        absents: parseInt(form.absents) || 0,
      });

      await refetch();
      setEditSubject(null);
    } catch (err) {
      console.error('Error updating subject:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    setActionLoading(true);
    try {
      await deleteSubject(delSubject.subject_id);
      setDelSubject(null);
    } catch {} finally { setActionLoading(false); }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-24 pb-10 px-4 sm:px-8 max-w-7xl mx-auto">
        
        {/* Tab Selection */}
        <div className="flex justify-center mb-8">
          <div className="bg-white p-1 rounded-xl shadow-soft inline-flex overflow-x-auto max-w-full">
            <button
              onClick={() => setActiveTab('subjects')}
              className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-colors whitespace-nowrap ${activeTab === 'subjects' ? 'bg-purple-100 text-primary' : 'text-gray-500 hover:text-gray-900'}`}
            >
              Subjects
            </button>
            <button
              onClick={() => setActiveTab('timetable')}
              className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-colors whitespace-nowrap ${activeTab === 'timetable' ? 'bg-purple-100 text-primary' : 'text-gray-500 hover:text-gray-900'}`}
            >
              Timetable Upload
            </button>
            <button
              onClick={() => setActiveTab('calendar')}
              className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-colors whitespace-nowrap ${activeTab === 'calendar' ? 'bg-purple-100 text-primary' : 'text-gray-500 hover:text-gray-900'}`}
            >
              Calendar Access
            </button>
            <button
              onClick={() => setActiveTab('extension')}
              className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-colors whitespace-nowrap ${activeTab === 'extension' ? 'bg-purple-100 text-primary' : 'text-gray-500 hover:text-gray-900'}`}
            >
              Chrome Extension Sync
            </button>
          </div>
        </div>

        {activeTab === 'subjects' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="card p-0 overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Subjects</h2>
                  <p className="text-sm font-medium text-gray-500">Manage your enrolled subjects and attendance</p>
                </div>
                <button onClick={() => setAddOpen(true)} className="btn-primary text-sm py-2.5 px-5 flex items-center gap-2">
                  <Plus size={16} /> Add Subject
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center h-48"><LoadingSpinner size={40} className="text-primary" /></div>
              ) : subjects.length === 0 ? (
                <div className="text-center py-20">
                  <BookOpen size={48} className="mx-auto text-gray-300 mb-4" />
                  <h3 className="text-lg font-bold text-gray-900">No subjects yet</h3>
                  <p className="text-gray-500 font-medium">Add subjects manually or upload your timetable.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-gray-50/50">
                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Code</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Subject Name</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Faculty</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-center">Presents / Absents</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-center">Planned Classes</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {subjects.map(s => {
                        const calc = s.bunk_calculations?.find(c => c.checkpoint === 'mse1') || s.bunk_calculations?.[0];
                        const pCount = calc ? calc.classes_attended : 0;
                        const aCount = calc ? Math.max(0, calc.classes_total - calc.classes_attended) : 0;

                        return (
                          <tr key={s.subject_id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 font-mono text-sm text-gray-600 font-bold">{s.subject_code}</td>
                            <td className="px-6 py-4 text-sm font-bold text-gray-900">{s.subject_name}</td>
                            <td className="px-6 py-4 text-sm text-gray-600 font-medium">{s.faculty_name || '—'}</td>
                            <td className="px-6 py-4 text-sm font-bold text-center">
                              <span className="text-green-700 bg-green-50 px-2.5 py-1 rounded-lg mr-1.5">{pCount} P</span>
                              <span className="text-red-700 bg-red-50 px-2.5 py-1 rounded-lg">{aCount} A</span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600 font-medium text-center">{s.total_classes_planned || '—'}</td>
                            <td className="px-6 py-4 flex justify-center gap-2">
                              <button onClick={() => setEditSubject(s)} className="p-2 text-gray-400 hover:text-primary bg-white hover:bg-purple-50 rounded-lg transition-colors border border-gray-200 hover:border-purple-200">
                                <Edit2 size={16} />
                              </button>
                              <button onClick={() => setDelSubject(s)} className="p-2 text-gray-400 hover:text-red-500 bg-white hover:bg-red-50 rounded-lg transition-colors border border-gray-200 hover:border-red-200">
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === 'timetable' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card p-8">
            <TimetableUpload onExtracted={(data) => { setExtractedData(data); setCrossCorrectOpen(true); }} />
          </motion.div>
        )}

        {activeTab === 'calendar' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <CalendarSetup />
          </motion.div>
        )}

        {activeTab === 'extension' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card p-8 max-w-3xl mx-auto">
            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Bunk Calculator Sync Chrome Extension</h2>
            <p className="text-gray-500 mb-6 font-medium">Scrape attendance data directly from Contineo ERP, Nitte, VTU, or any college portal with zero manual data entry.</p>

            <div className="bg-gradient-to-r from-purple-50 to-cyan-50 p-6 rounded-2xl border border-purple-100 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h4 className="font-extrabold text-gray-900 text-lg">Test Portal Extension Demo</h4>
                <p className="text-sm text-gray-600 font-medium mt-1">Open the sample portal page in your browser to test live 1-click extension scraping.</p>
              </div>
              <a
                href="/portal_demo.html"
                target="_blank"
                rel="noreferrer"
                className="btn-primary text-sm py-3 px-6 shrink-0 flex items-center gap-2 whitespace-nowrap"
              >
                Open Portal Demo Page ↗
              </a>
            </div>

            <div className="space-y-4 text-sm text-gray-700 font-medium">
              <h4 className="font-extrabold text-gray-900 text-base">Setup Instructions:</h4>
              <ol className="list-decimal pl-5 space-y-2.5">
                <li>Load unpacked extension in Chrome: <code className="bg-gray-100 px-2.5 py-1 rounded text-primary font-mono text-xs border border-gray-200">d:\BunkCalculator\extension</code></li>
                <li>In extension popup, enter your workspace Access Code.</li>
                <li>Open your college portal attendance page (or the Demo Page above) and click <strong>"Sync Portal Attendance"</strong>!</li>
              </ol>
            </div>
          </motion.div>
        )}
      </main>

      {/* Modals */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add New Subject">
        <SubjectForm onSubmit={handleAdd} loading={actionLoading} />
      </Modal>

      <Modal open={!!editSubject} onClose={() => setEditSubject(null)} title="Edit Subject">
        {editSubject && (() => {
          const calc = editSubject.bunk_calculations?.find(c => c.checkpoint === 'mse1') || editSubject.bunk_calculations?.[0];
          const currentPresents = calc ? calc.classes_attended : 0;
          const currentAbsents = calc ? Math.max(0, calc.classes_total - calc.classes_attended) : 0;

          return (
            <SubjectForm
              initial={{
                subject_code: editSubject.subject_code || '',
                subject_name: editSubject.subject_name || '',
                faculty_name: editSubject.faculty_name || '',
                total_classes_planned: editSubject.total_classes_planned || '',
                presents: currentPresents,
                absents: currentAbsents,
              }}
              onSubmit={handleEdit}
              loading={actionLoading}
            />
          );
        })()}
      </Modal>

      <Modal open={!!delSubject} onClose={() => setDelSubject(null)}>
        <DeleteConfirm subject={delSubject} onConfirm={handleDelete} onCancel={() => setDelSubject(null)} loading={actionLoading} />
      </Modal>

      <CrossCorrectModal 
        open={crossCorrectOpen} 
        onClose={() => setCrossCorrectOpen(false)} 
        extractedData={extractedData} 
        onSave={() => { setCrossCorrectOpen(false); setActiveTab('subjects'); }}
        onRefetch={refetch}
      />
    </div>
  );
};

export default Subjects;
