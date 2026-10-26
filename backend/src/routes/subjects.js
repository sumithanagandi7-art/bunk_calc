import express from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate, assertSubjectOwnership } from '../middleware/auth.js';
import { recalculateBunk } from '../services/bunkCalculator.js';
import { syncAggregateAttendance } from '../services/attendanceSync.js';
import multer from 'multer';
import path from 'path';
import { parseTimetableWithOCR } from '../services/ocr.js';
import { analyzeDocumentWithLLM } from '../services/llmService.js';

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticate);

const subjectSchema = z.object({
  subject_code: z.string().min(1, 'Subject code is required').max(50).transform(v => v.trim().toUpperCase()),
  subject_name: z.string().optional().nullable().transform((v, ctx) => {
    if (v && v.trim()) return v.trim();
    const code = ctx.parent?.subject_code;
    return code ? code.trim().toUpperCase() : 'Subject';
  }),
  faculty_name: z.string().max(300).optional().nullable().transform((v) => (v ? v.trim() : '')),
  total_classes_planned: z.union([z.number(), z.string()]).optional().transform((v) => Math.max(0, parseInt(v, 10) || 0)),
  presents: z.union([z.number(), z.string()]).optional().transform((v) => (v !== undefined ? Math.max(0, parseInt(v, 10) || 0) : 0)),
  absents: z.union([z.number(), z.string()]).optional().transform((v) => (v !== undefined ? Math.max(0, parseInt(v, 10) || 0) : 0)),
});

// ── File upload configuration ─────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only JPEG, PNG, WebP, and PDF files are allowed.'));
  },
});

// ── GET /api/v1/subjects ──────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const subjects = await prisma.subject.findMany({
    where: { workspace_id: req.user.workspace_id },
    include: {
      bunk_calculations: true,
      _count: { select: { attendance_records: true } },
    },
    orderBy: { created_at: 'asc' },
  });

  res.json({ subjects });
});

// ── POST /api/v1/subjects ─────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { presents, absents, ...subjectData } = subjectSchema.parse(req.body);
    const workspaceId = req.user.workspace_id;
    const normalizedCode = subjectData.subject_code;
    const normalizedName = subjectData.subject_name || normalizedCode;

    // Use upsert so existing subjects with same code are updated cleanly
    const subject = await prisma.subject.upsert({
      where: {
        workspace_id_subject_code: {
          workspace_id: workspaceId,
          subject_code: normalizedCode,
        },
      },
      update: {
        subject_name: normalizedName,
        faculty_name: subjectData.faculty_name ? subjectData.faculty_name.trim() : '',
        total_classes_planned: Math.max(subjectData.total_classes_planned || 0, (presents || 0) + (absents || 0)),
      },
      create: {
        ...subjectData,
        subject_code: normalizedCode,
        subject_name: normalizedName,
        faculty_name: subjectData.faculty_name ? subjectData.faculty_name.trim() : '',
        total_classes_planned: Math.max(subjectData.total_classes_planned || 0, (presents || 0) + (absents || 0)),
        workspace_id: workspaceId,
      },
    });

    if ((presents !== undefined && presents > 0) || (absents !== undefined && absents > 0)) {
      await syncAggregateAttendance(prisma, subject.subject_id, presents, absents, 'manual');
    }

    await recalculateBunk(subject.subject_id);

    const fullSubject = await prisma.subject.findUnique({
      where: { subject_id: subject.subject_id },
      include: {
        bunk_calculations: true,
        _count: { select: { attendance_records: true } },
      },
    });

    res.status(201).json({ message: 'Subject saved successfully.', subject: fullSubject });
  } catch (err) {
    console.error('Error saving subject:', err);
    res.status(400).json({ error: err.message || 'Failed to save subject.', message: err.message || 'Failed to save subject.' });
  }
});

import { executeDocumentPipeline } from '../services/ocr/pipeline.js';

// ── POST /api/v1/subjects/timetable-upload ────────────────────────────────────
router.post('/timetable-upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  try {
    const pipelineRes = await executeDocumentPipeline({
      filePath: req.file.path,
      mimeType: req.file.mimetype,
      documentHint: 'college class timetable'
    });

    res.json({
      message: `Timetable parsed via ${pipelineRes.method}.`,
      parsed: {
        subjects: pipelineRes.subjects,
        quality: pipelineRes.quality,
        average_confidence: pipelineRes.average_confidence,
        file_hash: pipelineRes.file_hash,
      },
    });
  } catch (err) {
    res.status(422).json({ error: 'Parsing failed.', details: err.message });
  }
});

// ── POST /api/v1/subjects/batch ───────────────────────────────────────────────
// For timetable bulk upload
router.post('/batch', async (req, res) => {
  try {
    const { subjects } = z.object({
      subjects: z.array(subjectSchema),
    }).parse(req.body);

    const workspaceId = req.user.workspace_id;

    // Fetch existing workspace subjects once
    const existingWsSubjects = await prisma.subject.findMany({
      where: { workspace_id: workspaceId },
    });

    const created = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const sub of subjects) {
        const { presents, absents, ...subjectData } = sub;
        const normalizedCode = subjectData.subject_code;
        const normalizedName = subjectData.subject_name || normalizedCode;

        const match = existingWsSubjects.find(
          (s) => s.subject_code.trim().toUpperCase() === normalizedCode
        );

        let result;
        if (match) {
          result = await tx.subject.update({
            where: { subject_id: match.subject_id },
            data: {
              subject_name: normalizedName,
              faculty_name: subjectData.faculty_name || match.faculty_name || '',
              total_classes_planned: Math.max(subjectData.total_classes_planned || 0, match.total_classes_planned || 0, 40),
            },
          });
        } else {
          result = await tx.subject.create({
            data: {
              workspace_id: workspaceId,
              subject_code: normalizedCode,
              subject_name: normalizedName,
              faculty_name: subjectData.faculty_name || '',
              total_classes_planned: Math.max(subjectData.total_classes_planned || 0, (presents || 0) + (absents || 0), 40),
            },
          });
        }
        results.push({ subject: result, presents: presents || 0, absents: absents || 0 });
      }
      return results;
    });

    for (const item of created) {
      const sub = item.subject;
      const presents = item.presents || 0;
      const absents = item.absents || 0;

      if (presents > 0 || absents > 0) {
        await syncAggregateAttendance(prisma, sub.subject_id, presents, absents, 'ocr_upload');
      }
      await recalculateBunk(sub.subject_id);
    }

    const updatedSubjects = await prisma.subject.findMany({
      where: { workspace_id: workspaceId },
      include: { bunk_calculations: true },
    });

    res.status(201).json({ message: 'Subjects saved successfully.', subjects: updatedSubjects });
  } catch (err) {
    console.error('Save batch subjects error:', err);
    res.status(400).json({ error: err.message || 'Failed to save batch subjects.', message: err.message || 'Failed to save batch subjects.' });
  }
});


// ── GET /api/v1/subjects/:id ──────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  await assertSubjectOwnership(req.params.id, req.user.workspace_id);

  const full = await prisma.subject.findUnique({
    where: { subject_id: req.params.id },
    include: {
      bunk_calculations: true,
      attendance_records: { orderBy: { class_date: 'desc' }, take: 50 },
    },
  });

  res.json({ subject: full });
});

// ── PUT /api/v1/subjects/:id ──────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  await assertSubjectOwnership(req.params.id, req.user.workspace_id);

  const { presents, absents, ...subjectData } = subjectSchema.partial().parse(req.body);

  const subject = await prisma.subject.update({
    where: { subject_id: req.params.id },
    data: subjectData,
  });

  if (presents !== undefined || absents !== undefined) {
    const currentRecords = await prisma.attendanceRecord.findMany({
      where: { subject_id: req.params.id },
    });
    const currP = currentRecords.filter((r) => r.status === 'present' || r.status === 'condoned').length;
    const currA = currentRecords.filter((r) => r.status === 'absent').length;

    const targetP = presents !== undefined ? presents : currP;
    const targetA = absents !== undefined ? absents : currA;

    await syncAggregateAttendance(prisma, req.params.id, targetP, targetA, 'manual');
  }

  await recalculateBunk(req.params.id);

  const fullSubject = await prisma.subject.findUnique({
    where: { subject_id: req.params.id },
    include: {
      bunk_calculations: true,
      _count: { select: { attendance_records: true } },
    },
  });

  res.json({ message: 'Subject updated.', subject: fullSubject });
});

// ── DELETE /api/v1/subjects/:id ───────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  await assertSubjectOwnership(req.params.id, req.user.workspace_id);

  await prisma.$transaction([
    prisma.attendanceRecord.deleteMany({ where: { subject_id: req.params.id } }),
    prisma.bunkCalculation.deleteMany({ where: { subject_id: req.params.id } }),
    prisma.subject.delete({ where: { subject_id: req.params.id } }),
  ]);

  res.json({ message: 'Subject and all related records deleted.' });
});

// Error handling middleware specific to this router for throw { status, message }
router.use((err, req, res, next) => {
  if (err.status) {
    res.status(err.status).json({ message: err.message });
  } else {
    next(err);
  }
});

export default router;
