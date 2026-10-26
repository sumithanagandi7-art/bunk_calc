import { useState, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, Image as ImageIcon, X, AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import LoadingSpinner from './LoadingSpinner.jsx';

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const ALLOWED_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
];

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const FileDropzone = ({
  onFileSelected,
  onAnalyze,
  onCancel,
  isProcessing = false,
  progress = 0,
  processingText = 'Processing file...',
  acceptHint = 'Supports PDF, JPG, JPEG, PNG, WEBP (Max 10MB)',
  actionLabel = 'Analyze Timetable',
  compact = false,
  photoOnly = false,
  className = '',
}) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  // Generate blob preview URL for images
  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }

    if (selectedFile.type.startsWith('image/')) {
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [selectedFile]);

  const handleDrop = useCallback((acceptedFiles, rejectedFiles) => {
    if (rejectedFiles && rejectedFiles.length > 0) {
      const rej = rejectedFiles[0];
      if (rej.file.size > MAX_FILE_SIZE_BYTES) {
        toast.error(`❌ File size exceeds ${MAX_FILE_SIZE_MB} MB limit.`);
      } else if (photoOnly) {
        toast.error('❌ Only a single photo (JPG, PNG, WEBP) is allowed.');
      } else {
        toast.error('❌ Unsupported file format. Please upload PDF, JPG, PNG, WEBP, XLSX, or CSV.');
      }
      return;
    }

    if (!acceptedFiles.length) return;
    const file = acceptedFiles[0];

    if (photoOnly && !file.type.startsWith('image/')) {
      toast.error('❌ Only a single photo (JPG, PNG, WEBP) is allowed.');
      return;
    }

    setSelectedFile(file);
    if (onFileSelected) onFileSelected(file);
  }, [onFileSelected, photoOnly]);

  const acceptConfig = photoOnly
    ? {
        'image/jpeg': ['.jpg', '.jpeg'],
        'image/png': ['.png'],
        'image/webp': ['.webp'],
      }
    : {
        'application/pdf': ['.pdf'],
        'image/jpeg': ['.jpg', '.jpeg'],
        'image/png': ['.png'],
        'image/webp': ['.webp'],
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
        'text/csv': ['.csv'],
      };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    maxSize: MAX_FILE_SIZE_BYTES,
    multiple: false,
    accept: acceptConfig,
    disabled: isProcessing,
  });

  const handleClearFile = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    if (onFileSelected) onFileSelected(null);
  };

  const isPdf = selectedFile && selectedFile.type === 'application/pdf';
  const isImage = selectedFile && selectedFile.type.startsWith('image/');

  return (
    <div className={`w-full ${compact ? 'space-y-2' : 'space-y-4'} ${className}`}>
      {/* 1. DROPZONE AREA (When no file selected or replacing) */}
      {!selectedFile && (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-2xl cursor-pointer transition-all ${
            compact
              ? 'p-3 sm:p-4 min-h-[80px] flex items-center justify-center gap-3 text-left'
              : 'p-8 sm:p-10 min-h-[220px] flex flex-col items-center justify-center text-center'
          } ${
            isDragActive
              ? 'border-primary bg-purple-50 scale-[1.01]'
              : 'border-purple-200/80 hover:border-primary hover:bg-white bg-white/90 shadow-xs'
          }`}
        >
          <input {...getInputProps()} />
          <div className={`${compact ? 'w-9 h-9 rounded-xl' : 'w-14 h-14 rounded-2xl mb-3'} bg-purple-100/80 flex items-center justify-center shrink-0 text-primary shadow-xs`}>
            <UploadCloud size={compact ? 20 : 28} />
          </div>
          {compact ? (
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-xs sm:text-sm truncate">
                Drop portal screenshot, attendance PDF, or document here
              </p>
              <p className="text-[11px] text-gray-500 font-medium truncate">
                or <span className="text-primary font-bold underline">browse file</span> ({acceptHint})
              </p>
            </div>
          ) : (
            <>
              <p className="font-extrabold text-gray-900 text-base sm:text-lg mb-1">
                Drop your PDF or image here
              </p>
              <p className="text-xs sm:text-sm text-gray-500 font-medium mb-3">
                or <span className="text-primary font-bold underline">choose a file</span> from your device
              </p>
              <span className="text-[11px] font-bold text-purple-600 bg-purple-50 px-3 py-1 rounded-full border border-purple-100">
                {acceptHint}
              </span>
            </>
          )}
        </div>
      )}

      {/* 2. FILE PREVIEW & DETAILS AREA (When file is selected) */}
      {selectedFile && (
        <div className={`card bg-white border border-gray-200/80 shadow-soft rounded-2xl ${
          compact ? 'p-3 space-y-3' : 'p-6 space-y-5 rounded-3xl'
        }`}>
          <div className="flex items-center gap-3">
            {/* Thumbnail / Icon Badge */}
            <div className="relative shrink-0">
              {isImage && previewUrl ? (
                <img
                  src={previewUrl}
                  alt="File preview"
                  className={`${compact ? 'w-10 h-10 rounded-xl' : 'w-16 h-16 sm:w-20 sm:h-20 rounded-2xl'} object-cover border border-gray-200 shadow-xs`}
                />
              ) : (
                <div className={`${compact ? 'w-10 h-10 rounded-xl' : 'w-16 h-16 sm:w-20 sm:h-20 rounded-2xl'} flex flex-col items-center justify-center border shadow-xs ${
                  isPdf ? 'bg-red-50 border-red-200 text-red-600' : 'bg-purple-50 border-purple-200 text-primary'
                }`}>
                  {isPdf ? <FileText size={compact ? 20 : 32} /> : <ImageIcon size={compact ? 20 : 32} />}
                  {!compact && (
                    <span className="text-[10px] font-bold uppercase mt-1">
                      {selectedFile.name.split('.').pop()}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* File Info */}
            <div className="flex-1 min-w-0">
              <h4 className={`font-bold text-gray-900 truncate ${compact ? 'text-xs' : 'text-base'}`} title={selectedFile.name}>
                {selectedFile.name}
              </h4>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500 font-medium">
                <span className="bg-gray-100 px-1.5 py-0.5 rounded font-mono font-bold uppercase text-gray-700">
                  {selectedFile.name.split('.').pop()}
                </span>
                <span>•</span>
                <span>{formatBytes(selectedFile.size)}</span>
              </div>
            </div>

            {/* Remove File Button (when not processing) */}
            {!isProcessing && (
              <button
                type="button"
                onClick={handleClearFile}
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                title="Change File"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* 3. PROGRESS & STATUS BAR (During processing) */}
          {isProcessing && (
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-gray-700 flex items-center gap-2">
                  <LoadingSpinner size={14} className="text-primary" />
                  {processingText}
                </span>
                <span className="text-primary font-mono">{progress}%</span>
              </div>

              <div className="h-2 bg-gray-100 rounded-full overflow-hidden p-0.5 border border-gray-200">
                <div
                  className="h-full bg-gradient-to-r from-primary via-purple-500 to-accent rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {onCancel && (
                <div className="flex justify-end pt-0.5">
                  <button
                    type="button"
                    onClick={onCancel}
                    className="text-[11px] font-bold text-gray-500 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded transition-colors flex items-center gap-1"
                  >
                    <X size={12} /> Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 4. ACTION BUTTON (When ready to analyze) */}
          {!isProcessing && onAnalyze && (
            <div className={`flex items-center justify-end gap-2 pt-2 border-t border-gray-100 ${compact ? '' : 'sm:flex-row flex-col'}`}>
              <button
                type="button"
                onClick={handleClearFile}
                className="btn-secondary py-1.5 px-3 text-xs font-bold"
              >
                Change
              </button>
              <button
                type="button"
                onClick={() => onAnalyze(selectedFile)}
                className="btn-primary py-1.5 px-4 text-xs font-bold shadow-xs flex items-center justify-center gap-1.5"
              >
                <UploadCloud size={14} />
                {actionLabel}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FileDropzone;
