import express from 'express';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_local_dev';

/**
 * Helper to vacuum the SQLite database so deleted rows are physically purged from disk.
 */
async function vacuumDatabase() {
  try {
    await prisma.$executeRawUnsafe('VACUUM');
  } catch (err) {
    console.warn('SQLite VACUUM notice:', err.message);
  }
}

/**
 * Helper to find a workspace by either workspace_id (UUID) or access_code
 */
async function findWorkspaceByIdentifier(identifier) {
  if (!identifier) return null;
  return await prisma.workspace.findFirst({
    where: {
      OR: [
        { workspace_id: identifier },
        { access_code: identifier.trim().toUpperCase() },
        { access_code: identifier.trim() },
      ],
    },
  });
}

/**
 * Helper to generate a unique access code if none provided
 */
async function generateUniqueAccessCode() {
  let attempts = 0;
  while (attempts < 15) {
    const random = Math.floor(1000 + Math.random() * 9000);
    const candidate = `BUNK-${random}`;
    const existing = await prisma.workspace.findUnique({ where: { access_code: candidate } });
    if (!existing) return candidate;
    attempts++;
  }
  return `BUNK-${Date.now().toString().slice(-4)}`;
}

// ── GET /api/v1/admin/stats ──────────────────────────────────────────────────
// Returns summary counts across all database tables and file size
router.get('/stats', async (_req, res) => {
  try {
    const [
      workspacesCount,
      subjectsCount,
      attendanceRecordsCount,
      bunkCalculationsCount,
      importsCount,
    ] = await Promise.all([
      prisma.workspace.count(),
      prisma.subject.count(),
      prisma.attendanceRecord.count(),
      prisma.bunkCalculation.count(),
      prisma.attendanceImport.count(),
    ]);

    const dbPath = path.resolve(__dirname, '../../prisma/dev.db');
    let fileSizeKb = null;
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      fileSizeKb = +(stats.size / 1024).toFixed(1);
    }

    res.json({
      database_file: 'prisma/dev.db',
      file_size_kb: fileSizeKb,
      counts: {
        users: workspacesCount,
        workspaces: workspacesCount,
        subjects: subjectsCount,
        attendance_records: attendanceRecordsCount,
        bunk_calculations: bunkCalculationsCount,
        attendance_imports: importsCount,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch database stats', details: err.message });
  }
});

// ── GET /api/v1/admin/users (or /workspaces) ──────────────────────────────────
// List all users with search, pagination, and data metrics
router.get(['/users', '/workspaces'], async (req, res) => {
  try {
    const { q, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * pageSize;

    const whereClause = q
      ? {
          OR: [
            { access_code: { contains: q } },
            { name: { contains: q } },
            { email: { contains: q } },
          ],
        }
      : {};

    const [totalCount, workspaces] = await Promise.all([
      prisma.workspace.count({ where: whereClause }),
      prisma.workspace.findMany({
        where: whereClause,
        include: {
          _count: {
            select: { subjects: true },
          },
          subjects: {
            select: {
              subject_id: true,
              _count: { select: { attendance_records: true, bunk_calculations: true } },
            },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    const list = workspaces.map((w) => {
      const recordsCount = w.subjects.reduce((sum, s) => sum + s._count.attendance_records, 0);
      const calcsCount = w.subjects.reduce((sum, s) => sum + s._count.bunk_calculations, 0);

      return {
        workspace_id: w.workspace_id,
        access_code: w.access_code,
        name: w.name || null,
        email: w.email || null,
        role: w.role || 'student',
        created_at: w.created_at,
        updated_at: w.updated_at,
        stats: {
          subjects_count: w._count.subjects,
          attendance_records_count: recordsCount,
          bunk_calculations_count: calcsCount,
        },
        // Backwards compatibility flat properties:
        subjects_count: w._count.subjects,
        attendance_records_count: recordsCount,
        bunk_calculations_count: calcsCount,
      };
    });

    res.json({
      success: true,
      total: totalCount,
      page: pageNum,
      limit: pageSize,
      pages: Math.ceil(totalCount / pageSize),
      users: list,
      workspaces: list,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list users', details: err.message });
  }
});

// ── GET /api/v1/admin/users/:identifier ──────────────────────────────────────
// Get complete user profile with enrolled subjects and records breakdown
router.get(['/users/:identifier', '/workspaces/:identifier'], async (req, res) => {
  const { identifier } = req.params;

  try {
    const workspace = await findWorkspaceByIdentifier(identifier);
    if (!workspace) {
      return res.status(404).json({ error: `User not found for identifier: "${identifier}"` });
    }

    const [subjects, imports] = await Promise.all([
      prisma.subject.findMany({
        where: { workspace_id: workspace.workspace_id },
        include: {
          bunk_calculations: true,
          _count: {
            select: { attendance_records: true },
          },
        },
        orderBy: { subject_code: 'asc' },
      }),
      prisma.attendanceImport.findMany({
        where: { workspace_id: workspace.workspace_id },
        orderBy: { created_at: 'desc' },
        take: 10,
      }),
    ]);

    // Aggregate attendance counts across subjects
    let totalPresent = 0;
    let totalAbsent = 0;
    let totalCondoned = 0;

    const subjectsWithDetails = await Promise.all(
      subjects.map(async (subj) => {
        const [presentCount, absentCount, condonedCount] = await Promise.all([
          prisma.attendanceRecord.count({ where: { subject_id: subj.subject_id, status: 'present' } }),
          prisma.attendanceRecord.count({ where: { subject_id: subj.subject_id, status: 'absent' } }),
          prisma.attendanceRecord.count({ where: { subject_id: subj.subject_id, status: 'condoned' } }),
        ]);

        totalPresent += presentCount;
        totalAbsent += absentCount;
        totalCondoned += condonedCount;

        return {
          subject_id: subj.subject_id,
          subject_code: subj.subject_code,
          subject_name: subj.subject_name,
          faculty_name: subj.faculty_name,
          total_classes_planned: subj.total_classes_planned,
          records_count: subj._count.attendance_records,
          attendance: {
            present: presentCount,
            absent: absentCount,
            condoned: condonedCount,
            total: presentCount + absentCount + condonedCount,
          },
          bunk_calculations: subj.bunk_calculations,
        };
      })
    );

    res.json({
      success: true,
      user: {
        workspace_id: workspace.workspace_id,
        access_code: workspace.access_code,
        name: workspace.name || null,
        email: workspace.email || null,
        role: workspace.role || 'student',
        created_at: workspace.created_at,
        updated_at: workspace.updated_at,
      },
      stats: {
        total_subjects: subjects.length,
        total_attendance_records: totalPresent + totalAbsent + totalCondoned,
        total_present: totalPresent,
        total_absent: totalAbsent,
        total_condoned: totalCondoned,
        overall_percentage: (totalPresent + totalAbsent + totalCondoned) > 0 && totalPresent > 0
          ? +((totalPresent / (totalPresent + totalAbsent + totalCondoned)) * 100).toFixed(1)
          : 0.0,
      },
      subjects: subjectsWithDetails,
      recent_imports: imports,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve user', details: err.message });
  }
});

// ── POST /api/v1/admin/users ─────────────────────────────────────────────────
// Add a new user (with access_code, optional name, email, role)
router.post(['/users', '/workspaces'], async (req, res) => {
  const { access_code, name, email, role } = req.body;

  let codeToUse = access_code ? String(access_code).trim().toUpperCase() : '';
  if (!codeToUse || codeToUse === 'AUTO') {
    codeToUse = await generateUniqueAccessCode();
  }

  if (codeToUse.length < 2 || codeToUse.length > 50) {
    return res.status(400).json({ error: 'Access code must be between 2 and 50 characters long.' });
  }

  try {
    const existing = await prisma.workspace.findUnique({
      where: { access_code: codeToUse },
    });

    if (existing) {
      return res.status(409).json({
        error: `User with access code "${codeToUse}" already exists.`,
        user: existing,
      });
    }

    const created = await prisma.workspace.create({
      data: {
        access_code: codeToUse,
        name: name ? String(name).trim() : null,
        email: email ? String(email).trim().toLowerCase() : null,
        role: role ? String(role).trim() : 'student',
      },
    });

    const token = jwt.sign(
      { workspace_id: created.workspace_id },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      success: true,
      message: `User "${created.access_code}" created successfully.`,
      user: created,
      token,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create user', details: err.message });
  }
});

// ── PUT / PATCH /api/v1/admin/users/:identifier ──────────────────────────────
// Edit / Update an existing user's details or access code
router.all(['/users/:identifier', '/workspaces/:identifier'], async (req, res, next) => {
  if (req.method !== 'PUT' && req.method !== 'PATCH') {
    return next();
  }

  const { identifier } = req.params;
  const { access_code, name, email, role } = req.body;

  try {
    const existingUser = await findWorkspaceByIdentifier(identifier);
    if (!existingUser) {
      return res.status(404).json({ error: `User not found for identifier: "${identifier}"` });
    }

    const updateData = {};

    // Update access_code if provided and different
    if (access_code !== undefined) {
      const cleanCode = String(access_code).trim().toUpperCase();
      if (cleanCode.length < 2 || cleanCode.length > 50) {
        return res.status(400).json({ error: 'Access code must be between 2 and 50 characters.' });
      }

      if (cleanCode !== existingUser.access_code) {
        // Verify unique
        const codeConflict = await prisma.workspace.findUnique({
          where: { access_code: cleanCode },
        });
        if (codeConflict && codeConflict.workspace_id !== existingUser.workspace_id) {
          return res.status(409).json({
            error: `Access code "${cleanCode}" is already in use by another user.`,
          });
        }
        updateData.access_code = cleanCode;
      }
    }

    if (name !== undefined) {
      updateData.name = name ? String(name).trim() : null;
    }

    if (email !== undefined) {
      updateData.email = email ? String(email).trim().toLowerCase() : null;
    }

    if (role !== undefined) {
      updateData.role = role ? String(role).trim() : 'student';
    }

    const updatedUser = await prisma.workspace.update({
      where: { workspace_id: existingUser.workspace_id },
      data: updateData,
    });

    res.json({
      success: true,
      message: `User "${updatedUser.access_code}" updated successfully.`,
      user: updatedUser,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user', details: err.message });
  }
});

// ── DELETE /api/v1/admin/users/:identifier ───────────────────────────────────
// Delete user with full cascade and vacuum
router.delete(['/users/:identifier', '/workspaces/:identifier'], async (req, res) => {
  const { identifier } = req.params;

  try {
    const workspace = await findWorkspaceByIdentifier(identifier);
    if (!workspace) {
      return res.status(404).json({ error: `User not found for identifier: "${identifier}"` });
    }

    // Delete imports
    await prisma.attendanceImport.deleteMany({
      where: { workspace_id: workspace.workspace_id },
    });

    // Delete workspace (Prisma cascades to subjects, attendance_records, bunk_calculations)
    await prisma.workspace.delete({
      where: { workspace_id: workspace.workspace_id },
    });

    // Cleanly purge deleted bytes from SQLite file on disk
    await vacuumDatabase();

    res.json({
      success: true,
      message: `User "${workspace.access_code}" (${workspace.workspace_id}) deleted successfully.`,
      deleted_user: {
        workspace_id: workspace.workspace_id,
        access_code: workspace.access_code,
        name: workspace.name || null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user', details: err.message });
  }
});

// ── POST /api/v1/admin/users/bulk-delete ─────────────────────────────────────
// Bulk delete multiple users by array of identifiers (IDs or access codes)
router.post(['/users/bulk-delete', '/workspaces/bulk-delete'], async (req, res) => {
  const { identifiers } = req.body;

  if (!Array.isArray(identifiers) || identifiers.length === 0) {
    return res.status(400).json({ error: 'Please provide an array of user identifiers to delete.' });
  }

  try {
    const deletedList = [];
    const notFoundList = [];

    for (const id of identifiers) {
      const ws = await findWorkspaceByIdentifier(String(id));
      if (!ws) {
        notFoundList.push(id);
        continue;
      }

      await prisma.attendanceImport.deleteMany({ where: { workspace_id: ws.workspace_id } });
      await prisma.workspace.delete({ where: { workspace_id: ws.workspace_id } });
      deletedList.push({
        workspace_id: ws.workspace_id,
        access_code: ws.access_code,
      });
    }

    if (deletedList.length > 0) {
      await vacuumDatabase();
    }

    res.json({
      success: true,
      message: `Deleted ${deletedList.length} users.`,
      deleted_count: deletedList.length,
      deleted_users: deletedList,
      not_found: notFoundList,
    });
  } catch (err) {
    res.status(500).json({ error: 'Bulk delete failed', details: err.message });
  }
});

// ── POST /api/v1/admin/users/:identifier/reset ───────────────────────────────
// Reset user data (clear subjects, records, calculations) while keeping the user account
router.post(['/users/:identifier/reset', '/workspaces/:identifier/reset'], async (req, res) => {
  const { identifier } = req.params;

  try {
    const workspace = await findWorkspaceByIdentifier(identifier);
    if (!workspace) {
      return res.status(404).json({ error: `User not found for identifier: "${identifier}"` });
    }

    // Delete attendance imports
    const deletedImports = await prisma.attendanceImport.deleteMany({
      where: { workspace_id: workspace.workspace_id },
    });

    // Delete subjects (cascades to attendance_records and bunk_calculations)
    const deletedSubjects = await prisma.subject.deleteMany({
      where: { workspace_id: workspace.workspace_id },
    });

    await vacuumDatabase();

    res.json({
      success: true,
      message: `Reset data for user "${workspace.access_code}". Enrolled subjects and records cleared.`,
      cleared: {
        subjects_deleted: deletedSubjects.count,
        imports_deleted: deletedImports.count,
      },
      user: {
        workspace_id: workspace.workspace_id,
        access_code: workspace.access_code,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'User reset failed', details: err.message });
  }
});

// ── POST /api/v1/admin/users/:identifier/token ───────────────────────────────
// Generate an active authentication token for this user (useful for admin testing/login)
router.post(['/users/:identifier/token', '/workspaces/:identifier/token'], async (req, res) => {
  const { identifier } = req.params;

  try {
    const workspace = await findWorkspaceByIdentifier(identifier);
    if (!workspace) {
      return res.status(404).json({ error: `User not found for identifier: "${identifier}"` });
    }

    const token = jwt.sign(
      { workspace_id: workspace.workspace_id },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      user: {
        workspace_id: workspace.workspace_id,
        access_code: workspace.access_code,
        name: workspace.name || null,
        email: workspace.email || null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate user token', details: err.message });
  }
});

// ── DELETE /api/v1/admin/id/:uniqueId ─────────────────────────────────────────
// Universal ID deletion endpoint: deletes any workspace, subject, attendance record, or calculation by its unique ID
router.delete('/id/:uniqueId', async (req, res) => {
  const { uniqueId } = req.params;

  if (!uniqueId) {
    return res.status(400).json({ error: 'No unique ID provided.' });
  }

  try {
    // 1. Check if it is a Workspace (by ID or access_code)
    const ws = await findWorkspaceByIdentifier(uniqueId);
    if (ws) {
      await prisma.attendanceImport.deleteMany({ where: { workspace_id: ws.workspace_id } });
      await prisma.workspace.delete({ where: { workspace_id: ws.workspace_id } });
      await vacuumDatabase();
      return res.json({
        success: true,
        type: 'user',
        message: `Deleted user "${ws.access_code}" (${ws.workspace_id}) and all child data.`,
        deleted_id: ws.workspace_id,
      });
    }

    // 2. Check if it is a Subject ID
    const subj = await prisma.subject.findUnique({
      where: { subject_id: uniqueId },
    });
    if (subj) {
      await prisma.subject.delete({ where: { subject_id: subj.subject_id } });
      await vacuumDatabase();
      return res.json({
        success: true,
        type: 'subject',
        message: `Deleted subject "${subj.subject_code}" (${subj.subject_name}).`,
        deleted_id: subj.subject_id,
      });
    }

    // 3. Check if it is an Attendance Record ID
    const rec = await prisma.attendanceRecord.findUnique({
      where: { record_id: uniqueId },
    });
    if (rec) {
      await prisma.attendanceRecord.delete({ where: { record_id: rec.record_id } });
      await vacuumDatabase();
      return res.json({
        success: true,
        type: 'attendance_record',
        message: `Deleted attendance record ${rec.record_id} (${rec.status} on ${rec.class_date}).`,
        deleted_id: rec.record_id,
      });
    }

    // 4. Check if it is a Bunk Calculation ID
    const calc = await prisma.bunkCalculation.findUnique({
      where: { calc_id: uniqueId },
    });
    if (calc) {
      await prisma.bunkCalculation.delete({ where: { calc_id: calc.calc_id } });
      await vacuumDatabase();
      return res.json({
        success: true,
        type: 'bunk_calculation',
        message: `Deleted bunk calculation ${calc.calc_id}.`,
        deleted_id: calc.calc_id,
      });
    }

    // 5. Check if it is an Attendance Import ID
    const imp = await prisma.attendanceImport.findUnique({
      where: { import_id: uniqueId },
    });
    if (imp) {
      await prisma.attendanceImport.delete({ where: { import_id: imp.import_id } });
      await vacuumDatabase();
      return res.json({
        success: true,
        type: 'attendance_import',
        message: `Deleted attendance import ${imp.import_id}.`,
        deleted_id: imp.import_id,
      });
    }

    return res.status(404).json({
      error: `ID "${uniqueId}" not found in any database table.`,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete ID', details: err.message });
  }
});

// ── POST /api/v1/admin/cleanup ───────────────────────────────────────────────
// Deletes all empty workspaces (0 subjects)
router.post('/cleanup', async (_req, res) => {
  try {
    const emptyWorkspaces = await prisma.workspace.findMany({
      where: {
        subjects: { none: {} },
      },
    });

    const deleted = [];
    for (const w of emptyWorkspaces) {
      await prisma.attendanceImport.deleteMany({ where: { workspace_id: w.workspace_id } });
      await prisma.workspace.delete({ where: { workspace_id: w.workspace_id } });
      deleted.push({ workspace_id: w.workspace_id, access_code: w.access_code });
    }

    await vacuumDatabase();

    res.json({
      success: true,
      message: `Cleaned up ${deleted.length} empty workspaces.`,
      deleted_count: deleted.length,
      deleted_workspaces: deleted,
    });
  } catch (err) {
    res.status(500).json({ error: 'Cleanup failed', details: err.message });
  }
});

// ── POST /api/v1/admin/vacuum ────────────────────────────────────────────────
// Manually triggers SQLite VACUUM to defragment and shrink dev.db
router.post('/vacuum', async (_req, res) => {
  try {
    await vacuumDatabase();
    const dbPath = path.resolve(__dirname, '../../prisma/dev.db');
    let sizeKb = null;
    if (fs.existsSync(dbPath)) {
      sizeKb = +(fs.statSync(dbPath).size / 1024).toFixed(1);
    }
    res.json({
      success: true,
      message: 'Database vacuum completed successfully.',
      current_size_kb: sizeKb,
    });
  } catch (err) {
    res.status(500).json({ error: 'Vacuum failed', details: err.message });
  }
});

export default router;
