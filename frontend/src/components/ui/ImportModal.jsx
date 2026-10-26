import { useState, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Trash2, Plus, Edit2, X, FileCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from './Modal.jsx';
import LoadingSpinner from './LoadingSpinner.jsx';
import FileDropzone from './FileDropzone.jsx';
import AIEngineBadge from './AIEngineBadge.jsx';
import { useAIEngineStore } from '../../store/aiEngineStore.js';
import api from '../../lib/api.js';
import { extractWithClientOllama } from '../../services/ollamaClient.js';

const ImportModal = ({ open, onClose, onImportCompleted }) => {
  const [step, setStep] = useState(1); // 1: Upload/File selected, 2: Processing, 3: Verification, 4: Success
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [processingText, setProcessingText] = useState('Analyzing your attendance report...');
  
  const [importId, setImportId] = useState('');
  const [fileName, setFileName] = useState('');
  const [extractedSubjects, setExtractedSubjects] = useState([]);
  const [docType, setDocType] = useState('auto');
  const [isImporting, setIsImporting] = useState(false);

  const abortControllerRef = useRef(null);

  const resetState = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStep(1);
    setFile(null);
    setProgress(0);
    setProcessingText('Analyzing your document...');
    setImportId('');
    setFileName('');
    setExtractedSubjects([]);
    setDocType('auto');
    setIsImporting(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleCancelProcessing = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    toast.error('Processing canceled.');
    setStep(1);
    setProgress(0);
  };

  const handleAnalyze = async (selectedFile) => {
    if (!selectedFile) return;

    const { engine, ollamaHost, ollamaModel } = useAIEngineStore.getState();

    setFile(selectedFile);
    setStep(2);
    setProgress(10);
    setProcessingText(
      engine === 'ollama'
        ? `Preparing Ollama Local Vision (${ollamaModel || 'vision'})...`
        : 'Uploading document securely...'
    );

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const fd = new FormData();
    fd.append('file', selectedFile);
    fd.append('engine', engine);
    if (ollamaModel) fd.append('ollama_model', ollamaModel);
    if (ollamaHost) fd.append('ollama_host', ollamaHost);

    try {
      let data = null;

    // 1. If engine is 'ollama', attempt direct in-browser extraction first
    if (engine === 'ollama') {
      try {
        setProcessingText(`Connecting to Ollama Local AI (${ollamaModel || 'vision'})...`);
        setProgress(35);
        const clientRes = await extractWithClientOllama({
          file: selectedFile,
          host: ollamaHost,
          model: ollamaModel,
        });
        if (clientRes && clientRes.parsed && clientRes.parsed.subjects) {
          data = {
            import_id: 'client_' + Date.now(),
            file_name: selectedFile.name,
            extraction_method: clientRes.engine_used,
            subjects: clientRes.parsed.subjects,
          };
          setProgress(90);
          setProcessingText('Extracted subjects via Ollama on your device!');
        }
      } catch (cErr) {
        console.warn('Client-side Ollama notice in ImportModal:', cErr.message, 'Using backend bridge...');
      }
    }

    // 2. If client Ollama wasn't used or failed, send to backend API
    if (!data) {
      setProcessingText(
        engine === 'ollama'
          ? `Routing to backend bridge for Ollama (${ollamaModel || 'vision'})...`
          : 'Analyzing document structure with Vision AI...'
      );
      const res = await api.post('/attendance/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        signal: controller.signal,
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 60) / progressEvent.total);
            setProgress(percent);
          }
        },
      });
      data = res.data;
    }

    setProgress(95);

      setTimeout(() => {
        setImportId(data.import_id || '');
        setFileName(data.file_name || selectedFile.name);
        setDocType(data.extraction_method || 'auto');
        
        // Format subjects for Verification Screen
        const formatted = (data.subjects || []).map((s) => {
          const presentsCount = s.presents !== undefined && s.presents !== null
            ? (parseInt(s.presents, 10) || 0)
            : (s.classes_attended !== undefined && s.classes_attended !== null ? parseInt(s.classes_attended, 10) || 0 : 0);
          
          let absentsCount = s.absents !== undefined && s.absents !== null
            ? (parseInt(s.absents, 10) || 0)
            : (s.total_classes && presentsCount > 0 ? Math.max(0, parseInt(s.total_classes, 10) - presentsCount) : 0);

          const totalConducted = presentsCount + absentsCount;
          const calculatedPct = totalConducted > 0
            ? +((presentsCount / totalConducted) * 100).toFixed(1)
            : (parseFloat(s.attendance_percentage) || 0);

          return {
            subject_id: s.matched_subject_id || null,
            subject_code: s.subject_code || '',
            subject_name: s.subject_name || '',
            faculty_name: s.faculty_name || '',
            presents: presentsCount,
            absents: absentsCount,
            total_classes_planned: parseInt(s.total_classes || s.total_classes_planned, 10) || Math.max(40, totalConducted),
            percentage: calculatedPct,
            low_confidence: Boolean(s.low_confidence),
            low_confidence_reason: s.low_confidence_reason || null,
            match_status: s.match_status || 'new_subject',
          };
        });

        setExtractedSubjects(formatted);
        setProgress(100);
        setStep(3); // Go to Verification Screen
        toast.success(`Extracted ${formatted.length} subjects from your document!`);
      }, 400);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
        // Canceled intentionally by user
        return;
      }
      toast.error(err.response?.data?.error || "❌ Unable to identify a timetable or attendance document. Please upload a clearer document.");
      setStep(1);
      setProgress(0);
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleUpdateField = (index, field, val) => {
    const updated = [...extractedSubjects];
    updated[index][field] = val;

    // Recalculate percentage inline
    const p = parseInt(updated[index].presents) || 0;
    const a = parseInt(updated[index].absents) || 0;
    const tot = p + a;
    updated[index].percentage = (tot > 0 && p > 0) ? +((p / tot) * 100).toFixed(1) : 0;
    setExtractedSubjects(updated);
  };

  const handleAddRow = () => {
    setExtractedSubjects([
      ...extractedSubjects,
      {
        subject_id: null,
        subject_code: `SUB${extractedSubjects.length + 1}`,
        subject_name: '',
        faculty_name: '',
        presents: 0,
        absents: 0,
        total_classes_planned: 40,
        percentage: 0,
        low_confidence: false,
        match_status: 'new_subject',
      },
    ]);
  };

  const handleRemoveRow = (index) => {
    setExtractedSubjects(extractedSubjects.filter((_, i) => i !== index));
  };

  // Step 3 -> Step 4: Confirm Import into Database
  const handleConfirmImport = async () => {
    if (extractedSubjects.length === 0) {
      toast.error('❌ No subjects to import.');
      return;
    }

    setIsImporting(true);
    try {
      const payload = {
        import_id: importId,
        items: extractedSubjects.map((s, i) => {
          const code = (s.subject_code || `SUB${i + 1}`).toString().trim().toUpperCase();
          const name = (s.subject_name || '').toString().trim() || code;
          return {
            subject_id: s.subject_id || null,
            subject_code: code,
            subject_name: name,
            faculty_name: s.faculty_name ? s.faculty_name.toString().trim() : '',
            presents: parseInt(s.presents) || 0,
            absents: parseInt(s.absents) || 0,
            total_classes_planned: Math.max(
              parseInt(s.total_classes_planned) || 40,
              (parseInt(s.presents) || 0) + (parseInt(s.absents) || 0)
            ),
          };
        }),
      };

      const { data } = await api.post('/attendance/import/confirm', payload);
      toast.success(`✓ ${data.message || 'Attendance imported successfully!'}`);
      
      setStep(4); // Success screen
      if (onImportCompleted) onImportCompleted(data.subjects);
    } catch (err) {
      console.error('Import confirm error:', err);
      toast.error(err.response?.data?.error || '❌ Import failed. Your existing attendance data has not been changed.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Import Attendance" className="max-w-4xl">
      {/* STEP 1 & 2: UPLOAD & PROCESSING INTERFACE */}
      {(step === 1 || step === 2) && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-gradient-to-r from-gray-50 to-indigo-50/30 p-3.5 rounded-xl border border-gray-100">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Upload Timetable or Attendance Report</h3>
              <p className="text-gray-500 text-xs mt-0.5">
                Supports <strong className="text-gray-700">PDF, JPG, PNG, WEBP</strong> (Max 10MB). Powered by Multi-Engine AI.
              </p>
            </div>
            <AIEngineBadge />
          </div>

          <FileDropzone
            onFileSelected={(f) => setFile(f)}
            onAnalyze={handleAnalyze}
            onCancel={handleCancelProcessing}
            isProcessing={step === 2}
            progress={progress}
            processingText={processingText}
            actionLabel="Analyze Timetable"
            acceptHint="Supports PDF, JPG, JPEG, PNG, WEBP, XLSX, CSV (Max 10MB)"
          />
        </div>
      )}

      {/* STEP 3 & STEP 6: VERIFICATION & REVIEW SCREEN */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-extrabold text-gray-900">Review Imported Attendance</h3>
              <p className="text-gray-500 text-sm mt-1">Extracted from <span className="font-bold text-gray-800">{fileName}</span>. Verify and edit numbers before saving.</p>
            </div>
            <button type="button" onClick={handleAddRow} className="btn-secondary text-xs flex items-center gap-1.5 py-2 px-3">
              <Plus size={14} /> Add Row
            </button>
          </div>

          {/* Low Confidence Warning Banners */}
          {extractedSubjects.some((s) => s.low_confidence) && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-800">
              <AlertTriangle size={20} className="shrink-0 mt-0.5 text-amber-600" />
              <div className="text-xs">
                <p className="font-bold text-sm">⚠ Low confidence warnings detected</p>
                <p className="mt-0.5">Some attendance values could not be confidently detected from the document. Please verify these values below.</p>
              </div>
            </div>
          )}

          {/* Verification Table */}
          <div className="overflow-x-auto max-h-[50vh] border border-gray-100 rounded-2xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200">
                  <th className="py-3 px-4 font-bold text-gray-500 text-xs uppercase">Code</th>
                  <th className="py-3 px-4 font-bold text-gray-500 text-xs uppercase">Subject Name</th>
                  <th className="py-3 px-4 font-bold text-gray-500 text-xs uppercase text-center">Attended</th>
                  <th className="py-3 px-4 font-bold text-gray-500 text-xs uppercase text-center">Total</th>
                  <th className="py-3 px-4 font-bold text-gray-500 text-xs uppercase text-center">%</th>
                  <th className="py-3 px-4 font-bold text-gray-500 text-xs uppercase text-center">Match Status</th>
                  <th className="py-3 px-4 font-bold text-gray-500 text-xs uppercase"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {extractedSubjects.map((row, i) => (
                  <tr key={i} className={`hover:bg-gray-50/80 transition-colors ${row.low_confidence ? 'bg-amber-50/40' : ''}`}>
                    <td className="py-2 px-4">
                      <input
                        value={row.subject_code}
                        onChange={(e) => handleUpdateField(i, 'subject_code', e.target.value)}
                        className="input-field py-1.5 px-2 text-xs font-mono font-bold w-24"
                        placeholder="CS101"
                      />
                    </td>
                    <td className="py-2 px-4">
                      <input
                        value={row.subject_name}
                        onChange={(e) => handleUpdateField(i, 'subject_name', e.target.value)}
                        className="input-field py-1.5 px-2 text-xs min-w-[140px]"
                        placeholder="Subject Title"
                      />
                    </td>
                    <td className="py-2 px-4 text-center">
                      <input
                        type="number"
                        min="0"
                        value={row.presents}
                        onChange={(e) => handleUpdateField(i, 'presents', e.target.value)}
                        className="input-field py-1.5 px-2 text-xs w-20 text-center bg-green-50 text-green-700 font-bold"
                      />
                    </td>
                    <td className="py-2 px-4 text-center">
                      <input
                        type="number"
                        min="1"
                        value={parseInt(row.presents) + parseInt(row.absents)}
                        onChange={(e) => {
                          const newTotal = parseInt(e.target.value) || 0;
                          const p = parseInt(row.presents) || 0;
                          handleUpdateField(i, 'absents', Math.max(0, newTotal - p));
                        }}
                        className="input-field py-1.5 px-2 text-xs w-20 text-center font-bold"
                      />
                    </td>
                    <td className="py-2 px-4 text-center">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-extrabold ${
                        row.percentage >= 75 ? 'bg-green-100 text-green-700' :
                        row.percentage >= 60 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {row.percentage}%
                      </span>
                    </td>
                    <td className="py-2 px-4 text-center">
                      {row.match_status.startsWith('matched') ? (
                        <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                          Matched
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                          New Subject
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(i)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <button type="button" onClick={handleClose} className="btn-secondary text-sm">
              Cancel
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={isImporting}
                className="btn-primary py-2.5 px-6 text-sm flex items-center gap-2"
              >
                {isImporting ? <LoadingSpinner size={16} /> : 'Import Attendance'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: SUCCESS CONFIRMATION SCREEN */}
      {step === 4 && (
        <div className="py-10 text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle2 size={48} />
          </div>
          <div>
            <h3 className="text-2xl font-extrabold text-gray-900">✓ Attendance imported successfully!</h3>
            <p className="text-gray-500 font-medium mt-1">
              <strong className="text-gray-900">{extractedSubjects.length} subjects</strong> updated and recalculated in BunkCalc.
            </p>
          </div>
          <button type="button" onClick={handleClose} className="btn-primary py-3 px-8 text-sm">
            View Attendance
          </button>
        </div>
      )}
    </Modal>
  );
};

export default ImportModal;
