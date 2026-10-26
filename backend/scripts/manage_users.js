import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function vacuumDatabase() {
  try {
    await prisma.$executeRawUnsafe('VACUUM');
  } catch (err) {
    console.warn('SQLite VACUUM notice:', err.message);
  }
}

async function findUser(identifier) {
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

async function listUsers() {
  const workspaces = await prisma.workspace.findMany({
    include: {
      _count: {
        select: { subjects: true },
      },
      subjects: {
        select: {
          subject_id: true,
          _count: { select: { attendance_records: true } },
        },
      },
    },
    orderBy: { created_at: 'desc' },
  });

  console.log('\n=== CURRENT USERS / WORKSPACES ===');
  console.log('Total:', workspaces.length);
  console.log('─'.repeat(110));
  console.log(
    `${'ACCESS CODE'.padEnd(16)} | ${'NAME'.padEnd(18)} | ${'EMAIL'.padEnd(24)} | ${'ROLE'.padEnd(8)} | ${'SUBJECTS'.padEnd(8)} | ${'RECORDS'.padEnd(8)}`
  );
  console.log('─'.repeat(110));

  for (const w of workspaces) {
    const recordsCount = w.subjects.reduce((sum, s) => sum + s._count.attendance_records, 0);
    const nameStr = (w.name || '-').slice(0, 18);
    const emailStr = (w.email || '-').slice(0, 24);
    const roleStr = (w.role || 'student').slice(0, 8);
    console.log(
      `${w.access_code.padEnd(16)} | ${nameStr.padEnd(18)} | ${emailStr.padEnd(24)} | ${roleStr.padEnd(8)} | ${String(w._count.subjects).padEnd(8)} | ${String(recordsCount).padEnd(8)}`
    );
  }
  console.log('─'.repeat(110));
}

async function getUser(identifier) {
  if (!identifier) {
    console.error('Error: Please provide a user access code or ID.');
    return;
  }

  const user = await findUser(identifier);
  if (!user) {
    console.error(`Error: User not found for identifier "${identifier}"`);
    return;
  }

  const subjects = await prisma.subject.findMany({
    where: { workspace_id: user.workspace_id },
    include: {
      _count: { select: { attendance_records: true } },
    },
  });

  console.log('\n=== USER DETAILS ===');
  console.log(`Access Code : ${user.access_code}`);
  console.log(`Workspace ID: ${user.workspace_id}`);
  console.log(`Name        : ${user.name || '(not set)'}`);
  console.log(`Email       : ${user.email || '(not set)'}`);
  console.log(`Role        : ${user.role || 'student'}`);
  console.log(`Created At  : ${user.created_at.toISOString()}`);
  console.log(`Updated At  : ${user.updated_at.toISOString()}`);
  console.log(`Subjects    : ${subjects.length}`);
  if (subjects.length > 0) {
    console.log(' Enrolled Subjects:');
    for (const s of subjects) {
      console.log(`  - [${s.subject_code}] ${s.subject_name} (${s._count.attendance_records} attendance records)`);
    }
  }
  console.log('────────────────────────────────────────');
}

async function addUser(accessCode, name, email, role) {
  let code = accessCode ? accessCode.trim().toUpperCase() : '';
  if (!code || code === 'AUTO') {
    code = `BUNK-${Math.floor(1000 + Math.random() * 9000)}`;
  }

  const existing = await prisma.workspace.findUnique({
    where: { access_code: code },
  });

  if (existing) {
    console.error(`Error: User with access code "${code}" already exists.`);
    return;
  }

  const user = await prisma.workspace.create({
    data: {
      access_code: code,
      name: name ? name.trim() : null,
      email: email ? email.trim().toLowerCase() : null,
      role: role ? role.trim() : 'student',
    },
  });

  console.log(`SUCCESS: User "${user.access_code}" created with workspace ID ${user.workspace_id}.`);
}

async function editUser(identifier, newAccessCode, name, email, role) {
  if (!identifier) {
    console.error('Error: Please specify the user identifier to edit.');
    return;
  }

  const user = await findUser(identifier);
  if (!user) {
    console.error(`Error: User not found for "${identifier}"`);
    return;
  }

  const updateData = {};
  if (newAccessCode && newAccessCode !== '-' && newAccessCode.toUpperCase() !== user.access_code) {
    const cleanCode = newAccessCode.trim().toUpperCase();
    const conflict = await prisma.workspace.findUnique({ where: { access_code: cleanCode } });
    if (conflict && conflict.workspace_id !== user.workspace_id) {
      console.error(`Error: Access code "${cleanCode}" is already in use.`);
      return;
    }
    updateData.access_code = cleanCode;
  }

  if (name && name !== '-') updateData.name = name.trim();
  if (email && email !== '-') updateData.email = email.trim().toLowerCase();
  if (role && role !== '-') updateData.role = role.trim();

  const updated = await prisma.workspace.update({
    where: { workspace_id: user.workspace_id },
    data: updateData,
  });

  console.log(`SUCCESS: Updated user "${updated.access_code}" (ID: ${updated.workspace_id}).`);
}

async function deleteUser(identifier) {
  if (!identifier) {
    console.error('Error: Please provide a workspace ID or access code to delete.');
    console.log('Usage: node scripts/manage_users.js delete <code_or_uuid>');
    return;
  }

  const workspace = await findUser(identifier);
  if (!workspace) {
    console.error(`Error: User/Workspace not found for "${identifier}"`);
    return;
  }

  // Delete associated imports
  await prisma.attendanceImport.deleteMany({
    where: { workspace_id: workspace.workspace_id },
  });

  // Cascade delete workspace (removes subjects, attendance_records, calculations)
  await prisma.workspace.delete({
    where: { workspace_id: workspace.workspace_id },
  });

  await vacuumDatabase();

  console.log(
    `SUCCESS: Deleted user "${workspace.access_code}" (ID: ${workspace.workspace_id}) and ran database vacuum.`
  );
}

async function resetUserData(identifier) {
  if (!identifier) {
    console.error('Error: Please provide a workspace ID or access code to reset.');
    return;
  }

  const user = await findUser(identifier);
  if (!user) {
    console.error(`Error: User not found for "${identifier}"`);
    return;
  }

  await prisma.attendanceImport.deleteMany({ where: { workspace_id: user.workspace_id } });
  const deletedSubjects = await prisma.subject.deleteMany({ where: { workspace_id: user.workspace_id } });
  await vacuumDatabase();

  console.log(
    `SUCCESS: Reset data for user "${user.access_code}". Cleared ${deletedSubjects.count} subjects and all associated records.`
  );
}

async function cleanupEmpty() {
  const emptyWorkspaces = await prisma.workspace.findMany({
    where: {
      subjects: { none: {} },
    },
  });

  if (emptyWorkspaces.length === 0) {
    console.log('No empty workspaces found to clean up.');
    return;
  }

  console.log(`Found ${emptyWorkspaces.length} empty workspaces with 0 subjects. Cleaning up...`);

  for (const w of emptyWorkspaces) {
    await prisma.attendanceImport.deleteMany({ where: { workspace_id: w.workspace_id } });
    await prisma.workspace.delete({ where: { workspace_id: w.workspace_id } });
    console.log(` - Deleted "${w.access_code}" (${w.workspace_id})`);
  }

  await vacuumDatabase();
  console.log(`SUCCESS: Cleaned up ${emptyWorkspaces.length} empty workspaces.`);
}

async function vacuum() {
  console.log('Running SQLite VACUUM...');
  await vacuumDatabase();
  console.log('SUCCESS: Database VACUUM complete.');
}

async function main() {
  const [,, command, arg1, arg2, arg3, arg4] = process.argv;

  try {
    switch (command) {
      case 'list':
      case 'ls':
        await listUsers();
        break;
      case 'get':
        await getUser(arg1);
        break;
      case 'add':
      case 'create':
        await addUser(arg1, arg2, arg3, arg4);
        break;
      case 'edit':
      case 'update':
        await editUser(arg1, arg2, arg3, arg4);
        break;
      case 'delete':
      case 'del':
      case 'rm':
        await deleteUser(arg1);
        break;
      case 'reset':
        await resetUserData(arg1);
        break;
      case 'cleanup':
        await cleanupEmpty();
        break;
      case 'vacuum':
        await vacuum();
        break;
      default:
        console.log(`
Bunk Calculator — User Management CLI Tool
Usage:
  node scripts/manage_users.js list
  node scripts/manage_users.js get <access_code_or_id>
  node scripts/manage_users.js add <access_code|auto> [name] [email] [role]
  node scripts/manage_users.js edit <current_id_or_code> <new_code> [new_name] [new_email] [new_role]
  node scripts/manage_users.js delete <access_code_or_id>
  node scripts/manage_users.js reset <access_code_or_id>
  node scripts/manage_users.js cleanup
  node scripts/manage_users.js vacuum
        `);
        await listUsers();
        break;
    }
  } catch (err) {
    console.error('Operation failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
