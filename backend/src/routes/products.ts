import { NextFunction, Request, Response, Router } from 'express';
import prisma from '../db';
import { isNonEmptyString, isValidSlug } from '../utils/validation';

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { q, category, featured } = req.query;
    if (q !== undefined && !isNonEmptyString(q, 200)) {
      return res.status(400).json({ message: 'Search query is invalid.' });
    }
    if (category !== undefined && !isNonEmptyString(category, 191)) {
      return res.status(400).json({ message: 'Category is invalid.' });
    }
    if (featured !== undefined && featured !== 'true' && featured !== 'false') {
      return res.status(400).json({ message: 'Featured must be true or false.' });
    }
    const filters: any = { published: true };

    if (q) {
      filters.OR = [
        { name: { contains: String(q) } },
        { description: { contains: String(q) } },
      ];
    }

    if (category) {
      filters.category = { name: String(category) };
    }

    if (featured === 'true') {
      filters.featured = true;
    }

    if (featured === 'false') {
      filters.featured = false;
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
    if (!isValidSlug(slug)) {
      return res.status(400).json({ message: 'Product slug is invalid.' });
    }
    const product = await prisma.product.findFirst({
      where: { slug, published: true },
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
