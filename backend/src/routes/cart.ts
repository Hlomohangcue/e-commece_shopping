import { NextFunction, Request, Response, Router } from 'express';
import prisma from '../db';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await prisma.cartItem.findMany({
      where: { userId: req.userId },
      include: { product: true },
    });
    res.json(items);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId, quantity = 1 } = req.body;
    const existing = await prisma.cartItem.findFirst({
      where: { userId: req.userId!, productId },
    });

    if (existing) {
      const updated = await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + quantity },
      });
      return res.status(200).json(updated);
    }

    const cartItem = await prisma.cartItem.create({
      data: { userId: req.userId!, productId, quantity },
    });
    res.status(201).json(cartItem);
  } catch (error) {
    next(error);
  }
});

router.put('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cartItemId, quantity } = req.body;
    const updated = await prisma.cartItem.update({
      where: { id: cartItemId },
      data: { quantity },
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.delete('/:productId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await prisma.cartItem.deleteMany({
      where: { userId: req.userId, productId: req.params.productId },
    });
    res.json({ deleted: result.count });
  } catch (error) {
    next(error);
  }
});

export default router;
