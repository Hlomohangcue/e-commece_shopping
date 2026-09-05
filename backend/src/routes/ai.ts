import { Router } from 'express';
import { getAiRecommendations, chatWithAi } from '../utils/openai';
import { isNonEmptyString, isRecord, isSafeIdentifier } from '../utils/validation';
import { createRateLimiter } from '../middleware/rateLimit';

const router = Router();
router.use(createRateLimiter(20, 60_000));

router.post('/recommendations', async (req, res, next) => {
  try {
    if (!isRecord(req.body)) {
      return res.status(400).json({ message: 'Request body must be an object.' });
    }
    const { userId, productIds } = req.body;
    if ((userId !== undefined && !isSafeIdentifier(userId)) || !Array.isArray(productIds) || productIds.length > 100 || !productIds.every(isSafeIdentifier)) {
      return res.status(400).json({ message: 'A valid productIds array is required.' });
    }
    const recommendations = await getAiRecommendations(userId ?? 'anonymous', productIds);
    res.json({ recommendations });
  } catch (error) {
    next(error);
  }
});

router.post('/chat', async (req, res, next) => {
  try {
    if (!isRecord(req.body)) {
      return res.status(400).json({ message: 'Request body must be an object.' });
    }
    const { message, sessionId } = req.body;
    if (!isNonEmptyString(message, 4000) || (sessionId !== undefined && !isSafeIdentifier(sessionId))) {
      return res.status(400).json({ message: 'A valid message is required.' });
    }
    const reply = await chatWithAi(message, sessionId);
    res.json({ reply });
  } catch (error) {
    next(error);
  }
});

export default router;
