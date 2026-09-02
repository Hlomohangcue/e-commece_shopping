import { NextFunction, Request, Response, Router } from 'express';
import fs from 'fs';
import path from 'path';
import prisma from '../db';
import { requireAdmin } from '../middleware/auth';

const router = Router();
const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';
const uploadDir = path.resolve(process.cwd(), 'uploads');

async function saveImageFile(file: { filename: string; data: string }) {
  await fs.promises.mkdir(uploadDir, { recursive: true });
  const ext = path.extname(file.filename) || '.png';
  const safeName = file.filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const filename = `${Date.now()}-${safeName}${ext === path.extname(safeName) ? '' : ext}`;
  const filePath = path.join(uploadDir, filename);
  const [, base64Data] = file.data.split(';base64,');
  const buffer = Buffer.from(base64Data || file.data, 'base64');
  await fs.promises.writeFile(filePath, buffer);
  return `${backendUrl}/uploads/${filename}`;
}
router.use(requireAdmin);

router.get('/analytics', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sales = await prisma.order.aggregate({
      _sum: { totalAmount: true },
      where: { status: { in: ['paid', 'fulfilled'] } },
    });
    const ordersCount = await prisma.order.count();
    const usersCount = await prisma.user.count();
    const productsCount = await prisma.product.count();

    res.json({
      sales: sales._sum.totalAmount || 0,
      ordersCount,
      usersCount,
      productsCount,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        _count: { select: { orders: true } },
        orders: {
          select: { createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json(
      users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        orderCount: user._count.orders,
        lastOrderAt: user.orders[0]?.createdAt || null,
      }))
    );
  } catch (error) {
    next(error);
  }
});

router.get('/orders', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orders = await prisma.order.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    res.json(
      orders.map((order) => ({
        id: order.id,
        status: order.status,
        totalAmount: order.totalAmount,
        paymentIntentId: order.paymentIntentId,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        shippingAddress: (() => {
          try {
            return JSON.parse(order.shippingAddress);
          } catch {
            return order.shippingAddress;
          }
        })(),
        user: order.user,
        items: order.items.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          price: item.price,
          product: item.product,
        })),
      }))
    );
  } catch (error) {
    next(error);
  }
});

router.get('/products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const products = await prisma.product.findMany({
      include: { images: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(products);
  } catch (error) {
    next(error);
  }
});

router.post('/products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, slug, description, price, currency, categoryName, inventory, published, featured, imageUrls, imageFiles } = req.body;

    const imageRecords = [];
    if (Array.isArray(imageFiles) && imageFiles.length > 0) {
      const savedUrls = await Promise.all(
        imageFiles.map(async (file: { filename: string; data: string }) => ({ url: await saveImageFile(file) }))
      );
      imageRecords.push(...savedUrls);
    } else if (Array.isArray(imageUrls)) {
      imageRecords.push(...imageUrls.map((url: string) => ({ url })));
    } else if (typeof imageUrls === 'string' && imageUrls.trim()) {
      imageRecords.push({ url: imageUrls });
    }

    const product = await prisma.product.create({
      data: {
        name,
        slug,
        description,
        price,
        currency,
        inventory,
        published,
        featured,
        category: {
          connectOrCreate: {
            where: { name: categoryName },
            create: { name: categoryName },
          },
        },
        images: imageRecords.length > 0 ? { create: imageRecords } : undefined,
      },
      include: { images: true, category: true },
    });

    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
});

router.put('/products/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productId = req.params.id;
    const { name, description, price, currency, inventory, published, featured, imageUrls, imageFiles } = req.body;

    const imageRecords = [];
    if (Array.isArray(imageFiles) && imageFiles.length > 0) {
      const savedUrls = await Promise.all(
        imageFiles.map(async (file: { filename: string; data: string }) => ({ url: await saveImageFile(file) }))
      );
      imageRecords.push(...savedUrls);
    } else if (Array.isArray(imageUrls)) {
      imageRecords.push(...imageUrls.map((url: string) => ({ url })));
    } else if (typeof imageUrls === 'string' && imageUrls.trim()) {
      imageRecords.push({ url: imageUrls });
    }

    const updateData: any = { name, description, price, currency, inventory, published, featured };

    if (imageRecords.length > 0) {
      await prisma.productImage.deleteMany({ where: { productId } });
      updateData.images = { create: imageRecords };
    }

    const updated = await prisma.product.update({
      where: { id: productId },
      data: updateData,
      include: { images: true, category: true },
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.delete('/products/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productId = req.params.id;
    await prisma.product.delete({ where: { id: productId } });
    res.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

export default router;
