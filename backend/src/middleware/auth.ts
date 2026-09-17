import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../db';

interface JwtPayload {
  sub: string;
  role: string;
}

const jwtSecret: string = process.env.JWT_SECRET || (() => {
  throw new Error('JWT_SECRET environment variable is required.');
})();

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authorization required' });
  }

  const token = authHeader.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, jwtSecret) as unknown as JwtPayload;
    (req as any).userId = payload.sub;
    (req as any).userRole = payload.role;
    // Re-verify the user exists in the database so that tokens for deleted
    // users are rejected on every protected request (not just /me).
    prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true } })
      .then((user) => {
        if (!user) {
          return res.status(401).json({ message: 'Authorization required' });
        }
        next();
      })
      .catch(() => res.status(401).json({ message: 'Authorization required' }));
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, async () => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { role: true },
      });
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
      }
      next();
    } catch (error) {
      next(error);
    }
  });
}
