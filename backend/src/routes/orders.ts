import { NextFunction, Request, Response, Router } from 'express';
import prisma from '../db';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items, shippingAddress, paymentIntentId } = req.body as {
      items: Array<{ productId: string; quantity: number; price: number }>;
      shippingAddress: Record<string, unknown>;
      paymentIntentId: string;
    };
    const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const order = await prisma.order.create({
      data: {
        userId: req.userId!,
        status: 'pending',
        paymentIntentId,
        shippingAddress: JSON.stringify(shippingAddress),
        totalAmount,
        items: { create: items.map((item: any) => ({
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
        })) },
      },
      include: { items: true },
    });
    res.status(201).json(order);
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.userId },
      include: {
        items: {
          include: { product: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(orders);
  } catch (error) {
    next(error);
  }
});

export default router;
