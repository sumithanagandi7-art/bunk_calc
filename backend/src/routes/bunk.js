import express from 'express';
import { PrismaClient } from '@prisma/client';
import { recalculateBunk, recalculateAllBunk } from '../services/bunkCalculator.js';
import { authenticate, assertSubjectOwnership } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticate);

// ── GET /api/v1/bunk ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const subjects = await prisma.subject.findMany({
    where: { workspace_id: req.user.workspace_id },
    include: { bunk_calculations: true },
    orderBy: { created_at: 'asc' },
  });

  res.json({ bunk_data: subjects });
});

// ── GET /api/v1/bunk/:subjectId ───────────────────────────────────────────────
router.get('/:subjectId', async (req, res) => {
  await assertSubjectOwnership(req.params.subjectId, req.user.workspace_id);

  const calculations = await prisma.bunkCalculation.findMany({
    where: { subject_id: req.params.subjectId },
  });

  res.json({ calculations });
});

// ── POST /api/v1/bunk/:subjectId/recalculate ──────────────────────────────────
router.post('/:subjectId/recalculate', async (req, res) => {
  await assertSubjectOwnership(req.params.subjectId, req.user.workspace_id);
  
  const result = await recalculateBunk(req.params.subjectId);

  const calculations = await prisma.bunkCalculation.findMany({
    where: { subject_id: req.params.subjectId },
  });

  res.json({ message: 'Recalculation complete.', summary: result, calculations });
});

// ── POST /api/v1/bunk/recalculate-all ────────────────────────────────────────
router.post('/recalculate-all', async (req, res) => {
  await recalculateAllBunk(req.user.workspace_id);
  res.json({ message: 'All subjects recalculated.' });
});

export default router;
