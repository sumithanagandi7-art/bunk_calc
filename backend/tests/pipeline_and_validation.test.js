import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAndScoreSubject, normalizeSubjectCode, safeParseInt } from '../src/services/ocr/validator.js';
import { detectTableStructure } from '../src/services/ocr/tableDetector.js';
import { analyzeImageQuality } from '../src/services/ocr/qualityAnalyzer.js';
import fs from 'fs';
import path from 'path';

test('safeParseInt correctly parses valid numbers and returns null for invalid', () => {
  assert.equal(safeParseInt(42), 42);
  assert.equal(safeParseInt('42'), 42);
  assert.equal(safeParseInt(' 42 '), 42);
  assert.equal(safeParseInt(0), 0);
  assert.equal(safeParseInt('0'), 0);
  assert.equal(safeParseInt(null), null);
  assert.equal(safeParseInt(undefined), null);
  assert.equal(safeParseInt(''), null);
  assert.equal(safeParseInt('abc'), null);
});

test('normalizeSubjectCode cleans whitespace and normalizes case', () => {
  assert.equal(normalizeSubjectCode(' 22cs51 '), '22CS51');
  assert.equal(normalizeSubjectCode('cs 101'), 'CS101');
  assert.equal(normalizeSubjectCode(''), '');
  assert.equal(normalizeSubjectCode(null), '');
});

test('validateAndScoreSubject does not silently swap attended and total', () => {
  // If presents > totalClasses, it must NOT swap them silently, but flag a warning
  const subject = {
    subject_code: '22CS51',
    subject_name: 'Computer Networks',
    presents: 30,
    total_classes: 25,
  };

  const result = validateAndScoreSubject(subject);
  assert.equal(result.classes_attended, 30, 'Should preserve the parsed presents');
  assert.equal(result.total_classes, 25, 'Should preserve the parsed total');
  assert.ok(result.warnings.length > 0, 'Should issue a warning');
  assert.ok(result.warnings.some(w => w.includes('exceeds total classes')), 'Warning should indicate column discrepancy');
  assert.equal(result.needs_review, true, 'Should flag needs_review');
});

test('validateAndScoreSubject correctly computes confidence for consistent data', () => {
  const subject = {
    subject_code: '22CS51',
    subject_name: 'Computer Networks',
    presents: 20,
    absents: 5,
    total_classes: 25,
  };

  const result = validateAndScoreSubject(subject, 2);
  assert.equal(result.classes_attended, 20);
  assert.equal(result.classes_absent, 5);
  assert.equal(result.total_classes, 25);
  assert.equal(result.attendance_percentage, 80);
  assert.ok(result.confidence_score >= 0.8, 'Confidence should be high for matching math');
  assert.equal(result.needs_review, false);
});

test('detectTableStructure maps columns using headers and does not treat serial number as attendance', () => {
  const textWithHeader = `
Sl No | Course Code | Course Name | Classes Conducted | Classes Attended | Percentage
1     | 22CS51      | Networks    | 32                | 28               | 87.5%
2     | 22CS52      | Automata    | 30                | 25               | 83.3%
`;

  const result = detectTableStructure(textWithHeader);
  assert.ok(result.headerDetected, 'Header should be detected');
  assert.equal(result.rows.length, 2, 'Should extract 2 rows');

  const row1 = result.rows[0];
  assert.equal(row1.subject_code, '22CS51');
  assert.equal(row1.classes_conducted, 32, 'Conducted should be 32, not 1 or 87');
  assert.equal(row1.classes_attended, 28, 'Attended should be 28, not 1 or 87');
  assert.equal(row1.attendance_percentage, 87.5);
});

test('detectTableStructure skips summary rows', () => {
  const textWithSummary = `
Course Code | Classes Conducted | Classes Attended
22CS51      | 30                | 25
Total       | 30                | 25
Grand Total | 30                | 25
`;

  const result = detectTableStructure(textWithSummary);
  const codes = result.rows.map(r => r.subject_code);
  assert.ok(codes.includes('22CS51'));
  assert.ok(!codes.includes('TOTAL'));
  assert.ok(!codes.includes('GRAND TOTAL'));
});

test('analyzeImageQuality accurately reads PNG header dimensions', async () => {
  // Create a minimal 100x200 PNG buffer
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  // IHDR chunk: length 13, 'IHDR', width 4 bytes BE, height 4 bytes BE, etc.
  const pngHeader = Buffer.alloc(33);
  // Signature
  pngHeader.set([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], 0);
  // IHDR chunk length = 13
  pngHeader.writeUInt32BE(13, 8);
  // 'IHDR'
  pngHeader.write('IHDR', 12, 'ascii');
  // Width = 1200
  pngHeader.writeUInt32BE(1200, 16);
  // Height = 800
  pngHeader.writeUInt32BE(800, 20);

  const testFilePath = path.join(process.cwd(), 'temp_test_image.png');
  fs.writeFileSync(testFilePath, pngHeader);

  try {
    const quality = await analyzeImageQuality(testFilePath);
    assert.equal(quality.width, 1200);
    assert.equal(quality.height, 800);
    assert.equal(quality.resolution, '1200x800');
  } finally {
    if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
  }
});
