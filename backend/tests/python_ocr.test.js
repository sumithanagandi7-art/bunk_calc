import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import { executePythonOCR } from '../src/services/ocr/pythonOcrService.js';

test('Python OCR model (OpenCV + Tesseract) extracts subject code, name, and faculty', async () => {
  const sampleImagePath = 'C:/Users/sumit/.gemini/antigravity-ide/brain/ad6abe8a-2469-4569-9a89-f2543dce2a18/.user_uploaded/media_1792910883503.jpg';

  if (!fs.existsSync(sampleImagePath)) {
    // If running in an environment without the local brain path, skip gracefully
    console.log('Skipping image test: sample file not present at path');
    return;
  }

  const res = await executePythonOCR(sampleImagePath);
  assert.equal(res.success, true, 'Python OCR should execute successfully');
  assert.ok(Array.isArray(res.subjects), 'Should return subjects array');
  assert.ok(res.subjects.length >= 15, `Expected at least 15 subjects, got ${res.subjects.length}`);

  // Verify critical fields exist on each subject
  for (const s of res.subjects) {
    assert.ok(s.subject_code, 'Subject must have a subject_code');
    assert.ok(s.subject_name, 'Subject must have a subject_name');
    assert.ok(s.faculty_name !== undefined, 'Subject must have a faculty_name field');
  }

  // Verify key subjects from the timetable
  const c51 = res.subjects.find(s => s.subject_code === '22CS51');
  assert.ok(c51, '22CS51 must be present');
  assert.equal(c51.subject_name, 'Computer Networks');
  assert.ok(c51.faculty_name.includes('Monika Singh'));

  const c52 = res.subjects.find(s => s.subject_code === '22CS52');
  assert.ok(c52, '22CS52 must be present');
  assert.equal(c52.subject_name, 'Theory Of Computation');

  const c554 = res.subjects.find(s => s.subject_code === '22CSE554');
  assert.ok(c554, '22CSE554 must be present');
  assert.equal(c554.subject_name, 'Data science Using Python');
  assert.ok(c554.faculty_name.includes('Aishwarya'));
});
