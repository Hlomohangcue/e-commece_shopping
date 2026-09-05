import { NextFunction, Request, Response, Router } from 'express';
import prisma from '../db';
import { requireAuth } from '../middleware/auth';
import { isPositiveInteger, isRecord, isSafeIdentifier } from '../utils/validation';

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
    if (!isRecord(req.body)) {
      return res.status(400).json({ message: 'Request body must be an object.' });
    }
    const { productId, quantity = 1 } = req.body;
    if (!isSafeIdentifier(productId) || !isPositiveInteger(quantity)) {
      return res.status(400).json({ message: 'A valid productId and positive integer quantity are required.' });
    }
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
    if (!isRecord(req.body)) {
      return res.status(400).json({ message: 'Request body must be an object.' });
    }
    const { cartItemId, quantity } = req.body;
    if (!isSafeIdentifier(cartItemId) || !isPositiveInteger(quantity)) {
      return res.status(400).json({ message: 'A valid cartItemId and positive integer quantity are required.' });
    }
    const ownedItem = await prisma.cartItem.findFirst({
      where: { id: cartItemId, userId: req.userId },
    });
    if (!ownedItem) {
      return res.status(404).json({ message: 'Cart item not found' });
    }

    const updated = await prisma.cartItem.update({
      where: { id: ownedItem.id },
      data: { quantity },
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.delete('/:productId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isSafeIdentifier(req.params.productId)) {
      return res.status(400).json({ message: 'Product ID is invalid.' });
    }
    const result = await prisma.cartItem.deleteMany({
      where: { userId: req.userId, productId: req.params.productId },
    });
    res.json({ deleted: result.count });
  } catch (error) {
    next(error);
  }
});

export default router;
