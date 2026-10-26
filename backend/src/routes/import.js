import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import { processAttendanceDocument } from '../services/import/attendanceExtractor.js';
import { recalculateBunk } from '../services/bunkCalculator.js';
import { syncAggregateAttendance } from '../services/attendanceSync.js';

const router = express.Router();
const prisma = new PrismaClient();

// Multer storage setup
const uploadDir = './uploads/';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB Limit
});

router.use(authenticate);

// Approved extensions & MIME types
const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.xlsx', '.csv'];
const ALLOWED_MIMES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv',
];

// Validation schema for import confirmation
const confirmSchema = z.object({
  import_id: z.string().optional().nullable(),
  items: z.array(
    z.object({
      subject_id: z.string().nullable().optional(),
      subject_code: z.string().min(1, 'Subject code is required').transform((v) => v.trim().toUpperCase()),
      subject_name: z.string().optional().nullable().transform((val, ctx) => {
        if (val && val.trim()) return val.trim();
        const code = ctx.parent?.subject_code;
        return code ? code.trim().toUpperCase() : 'Subject';
      }),
      faculty_name: z.string().optional().nullable().transform((v) => (v ? v.trim() : '')),
      presents: z.union([z.number(), z.string()]).transform((v) => Math.max(0, parseInt(v, 10) || 0)),
      absents: z.union([z.number(), z.string()]).transform((v) => Math.max(0, parseInt(v, 10) || 0)),
      total_classes_planned: z.union([z.number(), z.string()]).transform((v) => Math.max(0, parseInt(v, 10) || 40)),
    })
  ).min(1, 'At least one subject is required for import'),
});

/**
 * POST /api/v1/attendance/import
 * Step 1 & Step 2: Upload document, process, extract, normalize, and return preview JSON.
 */
router.post(['/', '/import'], (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File is larger than 10 MB.' });
      }
      return res.status(400).json({ error: err.message });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  const mimeType = req.file.mimetype;

  // Strict Security Validation: Extension & MIME Type
  if (!ALLOWED_EXTENSIONS.includes(ext) && !ALLOWED_MIMES.includes(mimeType)) {
    // Delete unapproved file
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Unsupported file type. Please upload PDF, PNG, JPG, XLSX, or CSV.' });
  }

  try {
    const engine = req.body.engine || req.query.engine || 'auto';
    const ollamaModel = req.body.ollama_model || req.query.ollama_model || null;
    const ollamaHost = req.body.ollama_host || req.query.ollama_host || null;

    // Extract and normalize attendance data
    const extractedData = await processAttendanceDocument({
      filePath: req.file.path,
      mimeType,
      originalName: req.file.originalname,
      workspaceId: req.user.workspace_id,
      engine,
      ollamaModel,
      ollamaHost,
    });

    if (!extractedData.subjects || extractedData.subjects.length === 0) {
      fs.unlink(req.file.path, () => {});
      return res.status(422).json({ error: 'No subjects could be detected in this document.' });
    }

    // Log pending import audit entry
    const importRecord = await prisma.attendanceImport.create({
      data: {
        workspace_id: req.user.workspace_id,
        file_name: req.file.originalname,
        file_type: ext.replace('.', ''),
        extracted_count: extractedData.subjects.length,
        status: 'pending',
      },
    });

    // Cleanup uploaded temp file
    fs.unlink(req.file.path, () => {});

    res.json({
      message: 'Document processed successfully.',
      import_id: importRecord.import_id,
      file_name: req.file.originalname,
      extraction_method: extractedData.extraction_method,
      total_extracted: extractedData.total_extracted,
      subjects: extractedData.subjects,
    });
  } catch (err) {
    console.error('Import processing error:', err);
    if (req.file && req.file.path) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: 'Failed to process document: ' + err.message });
  }
});

/**
 * POST /api/v1/attendance/import/confirm
 * Step 6 & Step 7: User-verified import into database using transactions.
 */
router.post(['/confirm', '/import/confirm'], async (req, res) => {
  const { import_id, items } = confirmSchema.parse(req.body);
  const workspaceId = req.user.workspace_id;

  try {
    const updatedSubjectIds = [];

    // Run database transaction to safely update subjects & sync attendance records
    await prisma.$transaction(async (tx) => {
      // Fetch all existing subjects in workspace once for case-insensitive code matching
      const existingSubjectsInWs = await tx.subject.findMany({
        where: { workspace_id: workspaceId },
      });

      for (const item of items) {
        let subjectId = item.subject_id;
        const normalizedCode = (item.subject_code || '').trim().toUpperCase();
        const normalizedName = (item.subject_name || '').trim() || normalizedCode;

        // Create or update Subject
        if (subjectId) {
          // Verify ownership
          const existing = existingSubjectsInWs.find((s) => s.subject_id === subjectId);

          if (existing) {
            await tx.subject.update({
              where: { subject_id: subjectId },
              data: {
                subject_code: normalizedCode,
                subject_name: normalizedName,
                faculty_name: item.faculty_name || existing.faculty_name || '',
                total_classes_planned: Math.max(item.total_classes_planned, item.presents + item.absents, existing.total_classes_planned || 0),
              },
            });
          } else {
            subjectId = null; // Fall back to creation if not found
          }
        }

        if (!subjectId) {
          const codeMatch = existingSubjectsInWs.find(
            (s) => s.subject_code.trim().toUpperCase() === normalizedCode
          );

          if (codeMatch) {
            subjectId = codeMatch.subject_id;
            await tx.subject.update({
              where: { subject_id: subjectId },
              data: {
                subject_name: normalizedName,
                faculty_name: item.faculty_name || codeMatch.faculty_name || '',
                total_classes_planned: Math.max(item.total_classes_planned, item.presents + item.absents, codeMatch.total_classes_planned || 0),
              },
            });
          } else {
            const newSub = await tx.subject.create({
              data: {
                workspace_id: workspaceId,
                subject_code: normalizedCode,
                subject_name: normalizedName,
                faculty_name: item.faculty_name || '',
                total_classes_planned: Math.max(item.total_classes_planned, item.presents + item.absents, 40),
              },
            });
            subjectId = newSub.subject_id;
          }
        }

        updatedSubjectIds.push(subjectId);

        // Sync attendance records non-destructively
        if (item.presents > 0 || item.absents > 0) {
          await syncAggregateAttendance(tx, subjectId, item.presents, item.absents, 'document_import');
        }
      }

      // Update AttendanceImport audit status if import_id provided and valid
      if (import_id && import_id.trim()) {
        try {
          const importExists = await tx.attendanceImport.findUnique({ where: { import_id } });
          if (importExists) {
            await tx.attendanceImport.update({
              where: { import_id },
              data: { status: 'confirmed', imported_at: new Date() },
            });
          }
        } catch (_) {}
      }
    });

    // Recalculate bunks for all updated subjects
    for (const subId of updatedSubjectIds) {
      await recalculateBunk(subId);
    }

    // Fetch updated subjects with recalculated stats
    const updatedSubjects = await prisma.subject.findMany({
      where: { workspace_id: workspaceId },
      include: { bunk_calculations: true },
    });

    res.status(201).json({
      message: 'Attendance imported successfully!',
      imported_count: updatedSubjectIds.length,
      subjects: updatedSubjects,
    });
  } catch (err) {
    console.error('Import confirm error:', err);
    res.status(500).json({ error: 'Import failed. Your existing attendance data has not been changed.' });
  }
});

export default router;
