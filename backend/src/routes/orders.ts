import { NextFunction, Request, Response, Router } from 'express';
import prisma from '../db';
import { requireAuth } from '../middleware/auth';
import { isNonEmptyString, isRecord, isSafeIdentifier, isPositiveInteger } from '../utils/validation';

const router = Router();

router.use(requireAuth);

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isRecord(req.body)) {
      return res.status(400).json({ message: 'Request body must be an object.' });
    }
    const { items, shippingAddress } = req.body as {
      items: Array<{ productId: string; quantity: number; price: number }>;
      shippingAddress: Record<string, unknown>;
    };
    if (!Array.isArray(items) || items.length === 0 || items.length > 100 || !items.every((item) =>
      isRecord(item) && isSafeIdentifier(item.productId) && isPositiveInteger(item.quantity)
    )) {
      return res.status(400).json({ message: 'Order items must contain valid product IDs and quantities.' });
    }
    if (!isRecord(shippingAddress) || Object.keys(shippingAddress).length === 0 || !Object.values(shippingAddress).every((value) => isNonEmptyString(value, 200))) {
      return res.status(400).json({ message: 'A valid shipping address is required.' });
    }
    const products = await prisma.product.findMany({
      where: { id: { in: items.map((item) => item.productId) } },
      select: { id: true, price: true },
    });
    const prices = new Map(products.map((product) => [product.id, product.price]));
    const pricedItems = items.map((item) => {
      const price = prices.get(item.productId);
      if (price === undefined) {
        throw new Error(`Product ${item.productId} not found`);
      }
      return { ...item, price };
    });
    const totalAmount = pricedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const order = await prisma.order.create({
      data: {
        userId: req.userId!,
        status: 'pending',
        shippingAddress: JSON.stringify(shippingAddress),
        totalAmount,
        items: { create: pricedItems.map((item) => ({
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
