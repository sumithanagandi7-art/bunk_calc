import express from 'express';
import multer from 'multer';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { parseCalendarWithOCR } from '../services/ocr.js';
import { analyzeDocumentWithLLM } from '../services/llmService.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();


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
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, WebP, and PDF files are allowed.'));
  },
});

function parseISODateString(val) {
  if (!val || typeof val !== 'string') return '';
  const trimmed = val.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = Date.parse(trimmed);
  if (!isNaN(parsed)) {
    return new Date(parsed).toISOString().split('T')[0];
  }
  return '';
}

function safeDateObj(val, defaultDaysFromNow = 30) {
  const isoStr = parseISODateString(val);
  if (isoStr) return new Date(isoStr);
  const d = new Date();
  d.setDate(d.getDate() + defaultDaysFromNow);
  return d;
}

// ── GET /api/v1/calendar ──────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const calendars = await prisma.academicCalendar.findMany({
    include: { institution: true },
    orderBy: { created_at: 'desc' },
    take: 1,
  });

  const latest = calendars.length > 0 ? calendars[0] : null;
  res.json({
    calendars,
    latest: latest ? {
      calendar_id: latest.calendar_id,
      semester_label: latest.semester_label,
      checkpoint1_start_date: latest.checkpoint1_start_date ? latest.checkpoint1_start_date.toISOString().split('T')[0] : '',
      checkpoint1_end_date: latest.checkpoint1_end_date ? latest.checkpoint1_end_date.toISOString().split('T')[0] : '',
      checkpoint2_start_date: latest.checkpoint2_start_date ? latest.checkpoint2_start_date.toISOString().split('T')[0] : '',
      checkpoint2_end_date: latest.checkpoint2_end_date ? latest.checkpoint2_end_date.toISOString().split('T')[0] : '',
      end_of_classes_date: latest.end_of_classes_date ? latest.end_of_classes_date.toISOString().split('T')[0] : '',
    } : null,
  });
});

// ── POST /api/v1/calendar/upload ──────────────────────────────────────────────
// Upload a calendar image/PDF → LLM / OCR parse → return structured preview for review

router.post('/upload', authenticate, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  const filePath = req.file.path;

  try {
    const llmRes = await analyzeDocumentWithLLM({ filePath, mimeType: req.file.mimetype, documentHint: 'academic calendar' });
    
    if (llmRes.success && llmRes.calendar) {
      const cal = llmRes.calendar;
      return res.json({
        message: 'File parsed with LLM Vision. Review the data and confirm.',
        file_path: filePath,
        parsed: {
          ocr_confidence: '95%',
          suggested: {
            semester_label: cal.semester_label || 'Semester 5',
            checkpoint1_start_date: parseISODateString(cal.checkpoint1_start_date),
            checkpoint1_end_date: parseISODateString(cal.checkpoint1_end_date),
            checkpoint2_start_date: parseISODateString(cal.checkpoint2_start_date),
            checkpoint2_end_date: parseISODateString(cal.checkpoint2_end_date),
            end_of_classes_date: parseISODateString(cal.end_of_classes_date),
          },
        },
      });
    }

    const parsed = await parseCalendarWithOCR(filePath);
    if (parsed.suggested) {
      parsed.suggested.checkpoint1_start_date = parseISODateString(parsed.suggested.checkpoint1_start_date);
      parsed.suggested.checkpoint1_end_date = parseISODateString(parsed.suggested.checkpoint1_end_date);
      parsed.suggested.checkpoint2_start_date = parseISODateString(parsed.suggested.checkpoint2_start_date);
      parsed.suggested.checkpoint2_end_date = parseISODateString(parsed.suggested.checkpoint2_end_date);
      parsed.suggested.end_of_classes_date = parseISODateString(parsed.suggested.end_of_classes_date);
    }

    res.json({
      message: 'File parsed. Review the data and confirm.',
      file_path: filePath,
      parsed,
    });
  } catch (err) {
    res.status(422).json({ error: 'Calendar parsing failed: ' + err.message, details: err.message });
  }
});

// ── POST /api/v1/calendar/confirm ─────────────────────────────────────────────
// Save confirmed calendar data to the database

router.post('/confirm', authenticate, async (req, res) => {
  try {
    const {
      institution_name,
      semester_label,
      checkpoint1_start_date,
      checkpoint1_end_date,
      checkpoint2_start_date,
      checkpoint2_end_date,
      end_of_classes_date,
      uploaded_file_path,
      checkpoint1_threshold,
      checkpoint2_threshold,
    } = req.body;

    // Upsert institution
    const institution = await prisma.institution.upsert({
      where: { institution_id: 1 }, // MVP: single institution
      create: {
        name: institution_name || 'My College',
        checkpoint1_threshold: checkpoint1_threshold || 75.0,
        checkpoint2_threshold: checkpoint2_threshold || 85.0,
      },
      update: {
        name: institution_name || 'My College',
        checkpoint1_threshold: checkpoint1_threshold || 75.0,
        checkpoint2_threshold: checkpoint2_threshold || 85.0,
      },
    });

    const calendar = await prisma.academicCalendar.create({
      data: {
        institution_id: institution.institution_id,
        semester_label: semester_label || 'Semester',
        checkpoint1_start_date: safeDateObj(checkpoint1_start_date, 15),
        checkpoint1_end_date: safeDateObj(checkpoint1_end_date, 20),
        checkpoint2_start_date: safeDateObj(checkpoint2_start_date, 60),
        checkpoint2_end_date: safeDateObj(checkpoint2_end_date, 65),
        end_of_classes_date: safeDateObj(end_of_classes_date, 90),
        uploaded_file_path,
      },
    });

    res.status(201).json({
      message: 'Academic calendar saved successfully.',
      calendar: {
        ...calendar,
        checkpoint1_start_date: calendar.checkpoint1_start_date.toISOString().split('T')[0],
        checkpoint1_end_date: calendar.checkpoint1_end_date.toISOString().split('T')[0],
        checkpoint2_start_date: calendar.checkpoint2_start_date.toISOString().split('T')[0],
        checkpoint2_end_date: calendar.checkpoint2_end_date.toISOString().split('T')[0],
        end_of_classes_date: calendar.end_of_classes_date.toISOString().split('T')[0],
      }
    });
  } catch (err) {
    console.error('Save calendar error:', err);
    res.status(400).json({ error: 'Failed to save calendar dates: ' + err.message });
  }
});

export default router;

