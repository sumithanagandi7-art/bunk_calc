import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Executes Python OpenCV + Tesseract OCR Model to extract timetable subjects or attendance status.
 * Calls backend/python_ocr/ocr_model.py
 */
export async function executePythonOCR(filePath, mode = 'auto') {
  if (!filePath || !fs.existsSync(filePath)) {
    return { success: false, error: 'File not found for Python OCR', subjects: [] };
  }

  const pythonScript = path.resolve(__dirname, '../../../python_ocr/ocr_model.py');
  if (!fs.existsSync(pythonScript)) {
    return { success: false, error: 'Python OCR model script not found', subjects: [] };
  }

  return new Promise((resolve) => {
    // Attempt python, python3, or system python
    const args = [pythonScript, filePath];
    if (mode && mode !== 'auto') {
      args.push('--mode', mode);
    }

    const child = spawn('python', args, {
      windowsHide: true,
      timeout: 90000,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      console.warn('Python OCR spawn error:', err.message);
      resolve({ success: false, error: err.message, subjects: [] });
    });

    child.on('close', (code) => {
      if (code !== 0) {
        console.warn(`Python OCR exited with code ${code}. Stderr: ${stderr}`);
        resolve({ success: false, error: stderr || `Exit code ${code}`, subjects: [] });
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(parsed);
      } catch (parseErr) {
        console.warn('Failed to parse Python OCR stdout:', parseErr.message, stdout);
        resolve({ success: false, error: parseErr.message, subjects: [] });
      }
    });
  });
}

/**
 * Specifically extracts attendance status (presents, absents, subject name & code)
 * from college portal screenshots using OpenCV table & badge detection.
 */
export async function executePythonAttendanceOCR(filePath) {
  return executePythonOCR(filePath, 'attendance');
}

