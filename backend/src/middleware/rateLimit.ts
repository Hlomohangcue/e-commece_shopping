import { NextFunction, Request, Response } from 'express';

type ClientWindow = {
  count: number;
  resetAt: number;
};

export function createRateLimiter(maxRequests: number, windowMs: number, maxClients = 1000) {
  const clients = new Map<string, ClientWindow>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    for (const [key, window] of clients) {
      if (window.resetAt <= now) clients.delete(key);
    }

    const clientId = req.ip || req.socket.remoteAddress || 'unknown';
    let window = clients.get(clientId);
    if (!window) {
      if (clients.size >= maxClients) {
        const oldest = clients.keys().next().value;
        if (oldest) clients.delete(oldest);
      }
      window = { count: 0, resetAt: now + windowMs };
      clients.set(clientId, window);
    }

    window.count += 1;
    if (window.count > maxRequests) {
      res.setHeader('Retry-After', Math.ceil((window.resetAt - now) / 1000));
      return res.status(429).json({ message: 'Too many requests. Please try again later.' });
    }
    next();
  };
}
