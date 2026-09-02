import { Router } from 'express';
import { getAiRecommendations, chatWithAi } from '../utils/openai';

const router = Router();

router.post('/recommendations', async (req, res, next) => {
  try {
    const { userId, productIds } = req.body;
    const recommendations = await getAiRecommendations(userId, productIds);
    res.json({ recommendations });
  } catch (error) {
    next(error);
  }
});

router.post('/chat', async (req, res, next) => {
  try {
    const { message, sessionId } = req.body;
    const reply = await chatWithAi(message, sessionId);
    res.json({ reply });
  } catch (error) {
    next(error);
  }
});

export default router;
