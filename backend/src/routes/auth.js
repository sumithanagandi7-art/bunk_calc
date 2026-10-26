import express from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const router = express.Router();
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_local_dev';

const accessSchema = z.object({
  access_code: z.string().min(3).max(50),
});

async function vacuumDatabase() {
  try {
    await prisma.$executeRawUnsafe('VACUUM');
  } catch (err) {
    console.warn('SQLite VACUUM notice:', err.message);
  }
}

// ── GET /api/v1/auth/generate-code ───────────────────────────────────────────
// Generates a random unique access code
router.get('/generate-code', async (_req, res) => {
  let uniqueCode = '';
  let attempts = 0;

  while (attempts < 10) {
    const random = Math.floor(1000 + Math.random() * 9000);
    const candidate = `BUNK-${random}`;
    const existing = await prisma.workspace.findUnique({ where: { access_code: candidate } });
    if (!existing) {
      uniqueCode = candidate;
      break;
    }
    attempts++;
  }

  if (!uniqueCode) {
    uniqueCode = `BUNK-${Date.now().toString().slice(-4)}`;
  }

  res.json({ access_code: uniqueCode });
});

// ── POST /api/v1/auth/login ──────────────────────────────────────────────────
// Login using existing access code
router.post('/login', async (req, res) => {
  try {
    const { access_code } = accessSchema.parse(req.body);

    const workspace = await prisma.workspace.findUnique({
      where: { access_code },
    });

    if (!workspace) {
      return res.status(404).json({ message: 'Access code not found. Please create a new unique code.' });
    }

    const token = jwt.sign(
      { workspace_id: workspace.workspace_id },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      message: 'Access granted',
      token,
      workspace: {
        workspace_id: workspace.workspace_id,
        access_code: workspace.access_code,
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid access code format', errors: error.errors });
    }
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── POST /api/v1/auth/create ─────────────────────────────────────────────────
// Create new workspace with guaranteed unique access code
router.post('/create', async (req, res) => {
  try {
    const { access_code } = accessSchema.parse(req.body);

    const existing = await prisma.workspace.findUnique({
      where: { access_code },
    });

    if (existing) {
      return res.status(409).json({ message: 'Access code already exists! Please enter a unique code or switch to Login.' });
    }

    const workspace = await prisma.workspace.create({
      data: { access_code },
    });

    const token = jwt.sign(
      { workspace_id: workspace.workspace_id },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      message: 'Workspace created successfully!',
      token,
      workspace: {
        workspace_id: workspace.workspace_id,
        access_code: workspace.access_code,
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid access code format', errors: error.errors });
    }
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── POST /api/v1/auth/access ─────────────────────────────────────────────────
// Generic login or create endpoint
router.post('/access', async (req, res) => {
  try {
    const { access_code } = accessSchema.parse(req.body);

    let workspace = await prisma.workspace.findUnique({
      where: { access_code },
    });

    if (!workspace) {
      workspace = await prisma.workspace.create({
        data: { access_code },
      });
    }

    const token = jwt.sign(
      { workspace_id: workspace.workspace_id },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      message: 'Access granted',
      token,
      workspace: {
        workspace_id: workspace.workspace_id,
        access_code: workspace.access_code,
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid access code', errors: error.errors });
    }
    console.error('Access error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── GET /api/v1/auth/workspaces ──────────────────────────────────────────────
// List all users/workspaces with subject and attendance counts
router.get('/workspaces', async (_req, res) => {
  try {
    const workspaces = await prisma.workspace.findMany({
      include: {
        _count: {
          select: {
            subjects: true,
          },
        },
        subjects: {
          select: {
            subject_id: true,
            _count: {
              select: {
                attendance_records: true,
              },
            },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const summary = workspaces.map((w) => {
      const recordsCount = w.subjects.reduce((sum, s) => sum + s._count.attendance_records, 0);
      return {
        workspace_id: w.workspace_id,
        access_code: w.access_code,
        created_at: w.created_at,
        subjects_count: w._count.subjects,
        attendance_records_count: recordsCount,
      };
    });

    res.json({
      total: summary.length,
      workspaces: summary,
    });
  } catch (error) {
    console.error('List workspaces error:', error);
    res.status(500).json({ message: 'Failed to fetch workspaces', error: error.message });
  }
});

// ── DELETE /api/v1/auth/workspaces/:identifier ───────────────────────────────
// Delete a workspace/user by either workspace_id (UUID) or access_code
router.delete('/workspaces/:identifier', async (req, res) => {
  const { identifier } = req.params;

  try {
    // Find workspace by ID or Access Code
    const workspace = await prisma.workspace.findFirst({
      where: {
        OR: [
          { workspace_id: identifier },
          { access_code: identifier },
        ],
      },
    });

    if (!workspace) {
      return res.status(404).json({ message: `Workspace not found for identifier: ${identifier}` });
    }

    // Delete attendance imports tied to this workspace
    await prisma.attendanceImport.deleteMany({
      where: { workspace_id: workspace.workspace_id },
    });

    // Delete workspace (cascades to subjects, attendance_records, bunk_calculations)
    await prisma.workspace.delete({
      where: { workspace_id: workspace.workspace_id },
    });

    await vacuumDatabase();

    res.json({
      success: true,
      message: `Workspace "${workspace.access_code}" (${workspace.workspace_id}) deleted successfully.`,
      deleted_workspace: {
        workspace_id: workspace.workspace_id,
        access_code: workspace.access_code,
      },
    });
  } catch (error) {
    console.error('Delete workspace error:', error);
    res.status(500).json({ message: 'Failed to delete workspace', error: error.message });
  }
});

// ── POST /api/v1/auth/workspaces/cleanup-empty ──────────────────────────────
// Delete all empty workspaces with 0 subjects
router.post('/workspaces/cleanup-empty', async (_req, res) => {
  try {
    const emptyWorkspaces = await prisma.workspace.findMany({
      where: {
        subjects: {
          none: {},
        },
      },
    });

    const deletedCodes = [];
    for (const w of emptyWorkspaces) {
      await prisma.attendanceImport.deleteMany({ where: { workspace_id: w.workspace_id } });
      await prisma.workspace.delete({ where: { workspace_id: w.workspace_id } });
      deletedCodes.push({ workspace_id: w.workspace_id, access_code: w.access_code });
    }

    await vacuumDatabase();

    res.json({
      success: true,
      message: `Cleaned up ${deletedCodes.length} empty workspaces.`,
      deleted_count: deletedCodes.length,
      deleted_workspaces: deletedCodes,
    });
  } catch (error) {
    console.error('Cleanup empty workspaces error:', error);
    res.status(500).json({ message: 'Failed to cleanup empty workspaces', error: error.message });
  }
});

export default router;

