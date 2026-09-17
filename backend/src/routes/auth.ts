import { NextFunction, Request, Response, Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import prisma from '../db';
import { requireAuth } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimit';
import { isNonEmptyString, isRecord, isValidEmail } from '../utils/validation';

const router = Router();

// Protect password guessing and account-creation abuse independently. These
// deliberately conservative per-IP windows remain in effect in every runtime.
export const loginRateLimiter = createRateLimiter(10, 15 * 60_000);
export const registerRateLimiter = createRateLimiter(5, 60 * 60_000);

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error('JWT_SECRET environment variable is required.');
}

const createToken = (user: any) =>
  jwt.sign({ sub: user.id, role: user.role }, jwtSecret, {
    expiresIn: '7d',
  });

router.post('/register', registerRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isRecord(req.body)) {
      return res.status(400).json({ message: 'Request body must be an object.' });
    }
    const { email, password, name } = req.body;
    if (!isValidEmail(email) || !isNonEmptyString(password, 256) || (name !== undefined && name !== null && !isNonEmptyString(name, 100))) {
      return res.status(400).json({ message: 'A valid email and password are required.' });
    }
    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, name, password: hashed, role: 'customer' },
    });
    const token = createToken(user);
    return res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ message: 'An account with that email already exists.' });
    }
    next(error);
  }
});

router.post('/login', loginRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isRecord(req.body)) {
      return res.status(400).json({ message: 'Request body must be an object.' });
    }
    const { email, password } = req.body;
    if (!isValidEmail(email) || !isNonEmptyString(password, 256)) {
      return res.status(400).json({ message: 'A valid email and password are required.' });
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = createToken(user);
    return res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (error) {
    next(error);
  }
});

router.get('/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, name: true, role: true },
    });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    next(error);
  }
});

export default router;
