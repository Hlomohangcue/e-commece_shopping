import { Request, Response, NextFunction } from 'express';

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  console.error('Unhandled request error:', error instanceof Error ? error.stack || error.message : error);

  const status = typeof error === 'object' && error !== null && 'status' in error &&
    typeof error.status === 'number' && error.status >= 400 && error.status < 500
    ? error.status
    : 500;
  const messages: Record<number, string> = {
    400: 'Bad request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not found',
    409: 'Conflict',
    422: 'Unprocessable entity',
  };
  res.status(status).json({ message: messages[status] || 'Internal server error' });
}
