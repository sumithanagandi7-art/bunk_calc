import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_local_dev';

export const authenticate = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ message: 'Not authorized, no access token provided.' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const workspace = await prisma.workspace.findUnique({
      where: { workspace_id: decoded.workspace_id },
    });

    if (!workspace) {
      return res.status(401).json({ message: 'Not authorized, workspace not found.' });
    }

    req.user = { workspace_id: workspace.workspace_id };
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ message: 'Not authorized, token failed.' });
  }
};

export const assertSubjectOwnership = async (subjectId, workspaceId) => {
  const subject = await prisma.subject.findUnique({
    where: { subject_id: subjectId },
  });
  if (!subject) throw { status: 404, message: 'Subject not found.' };
  if (subject.workspace_id !== workspaceId) throw { status: 403, message: 'Not authorized to access this subject.' };
  return subject;
};
