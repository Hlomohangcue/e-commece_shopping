import { NextFunction, Request, Response, Router } from 'express';
import prisma from '../db';

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { q, category, featured } = req.query;
    const filters: any = { published: true };

    if (q) {
      filters.OR = [
        { name: { contains: String(q), mode: 'insensitive' } },
        { description: { contains: String(q), mode: 'insensitive' } },
      ];
    }

    if (category) {
      filters.category = { name: String(category) };
    }

    if (featured === 'true') {
      filters.featured = true;
    }

    const products = await prisma.product.findMany({
      where: filters,
      include: { images: true, category: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(products);
  } catch (error) {
    next(error);
  }
});

router.get('/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slug } = req.params;
    const product = await prisma.product.findUnique({
      where: { slug },
      include: {
        images: true,
        reviews: { orderBy: { createdAt: 'desc' } },
        category: true,
      },
    });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    next(error);
  }
});

export default router;
