import { NextFunction, Request, Response, Router } from 'express';
import fs from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';
import prisma from '../db';
import { requireAdmin } from '../middleware/auth';
import { isHttpUrl, isNonEmptyString, isNonNegativeInteger, isRecord, isSafeIdentifier, isValidImageFile, isValidSlug } from '../utils/validation';

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: Date;
  _count: { orders: number };
  orders: Array<{ createdAt: Date }>;
};

type AdminOrderItem = {
  id: string;
  quantity: number;
  price: number;
  product: { id: string; name: string; slug: string };
};

type AdminOrder = {
  id: string;
  status: string;
  totalAmount: number;
  paymentIntentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  shippingAddress: string;
  user: { id: string; email: string; name: string | null };
  items: AdminOrderItem[];
};

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
      users.map((user: AdminUser) => ({
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
      orders.map((order: AdminOrder) => ({
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
        items: order.items.map((item: AdminOrderItem) => ({
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
    if (!isRecord(req.body)) {
      return res.status(400).json({ message: 'Request body must be an object.' });
    }
    const { name, slug, description, price, currency, categoryName, inventory, published, featured, imageUrls, imageFiles } = req.body;
    if (!isNonEmptyString(name, 200) || !isValidSlug(slug) || !isNonEmptyString(description, 5000) ||
      typeof price !== 'number' || !Number.isFinite(price) || price < 0 || !isNonEmptyString(currency, 10) ||
      !isNonEmptyString(categoryName, 191) || !isNonNegativeInteger(inventory) ||
      (published !== undefined && typeof published !== 'boolean') || (featured !== undefined && typeof featured !== 'boolean')) {
      return res.status(400).json({ message: 'Invalid product fields.' });
    }
    if (imageUrls !== undefined && ((!Array.isArray(imageUrls) && !isHttpUrl(imageUrls)) ||
      (Array.isArray(imageUrls) && !imageUrls.every((url) => isHttpUrl(url))))) {
      return res.status(400).json({ message: 'Image URLs are invalid.' });
    }
    if (imageFiles !== undefined && (!Array.isArray(imageFiles) || !imageFiles.every(isValidImageFile))) {
      return res.status(400).json({ message: 'Image files are invalid.' });
    }

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
    if (!isSafeIdentifier(productId) || !isRecord(req.body)) {
      return res.status(400).json({ message: 'Product ID or request body is invalid.' });
    }
    const { name, slug, description, price, currency, categoryName, inventory, published, featured, imageUrls, imageFiles } = req.body;
    if (name !== undefined && !isNonEmptyString(name, 200) || slug !== undefined && !isValidSlug(slug) ||
      description !== undefined && !isNonEmptyString(description, 5000) || currency !== undefined && !isNonEmptyString(currency, 10) ||
      price !== undefined && (typeof price !== 'number' || !Number.isFinite(price) || price < 0) ||
      inventory !== undefined && !isNonNegativeInteger(inventory) ||
      published !== undefined && typeof published !== 'boolean' || featured !== undefined && typeof featured !== 'boolean' ||
      categoryName !== undefined && !isNonEmptyString(categoryName, 191)) {
      return res.status(400).json({ message: 'Invalid product fields.' });
    }
    if (name === undefined && slug === undefined && description === undefined && price === undefined && currency === undefined &&
      categoryName === undefined && inventory === undefined && published === undefined && featured === undefined &&
      imageUrls === undefined && imageFiles === undefined) {
      return res.status(400).json({ message: 'At least one product field is required.' });
    }
    if (imageUrls !== undefined && ((!Array.isArray(imageUrls) && !isHttpUrl(imageUrls)) ||
      (Array.isArray(imageUrls) && !imageUrls.every((url) => isHttpUrl(url))))) {
      return res.status(400).json({ message: 'Image URLs are invalid.' });
    }
    if (imageFiles !== undefined && (!Array.isArray(imageFiles) || !imageFiles.every(isValidImageFile))) {
      return res.status(400).json({ message: 'Image files are invalid.' });
    }

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
    if (slug !== undefined) updateData.slug = slug;
    if (categoryName !== undefined) {
      updateData.category = { connectOrCreate: { where: { name: categoryName }, create: { name: categoryName } } };
    }

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
    if (!isSafeIdentifier(req.params.id)) {
      return res.status(400).json({ message: 'Product ID is invalid.' });
    }
    const productId = req.params.id;
    await prisma.product.delete({ where: { id: productId } });
    res.json({ deleted: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return res.status(409).json({
        message:
          "This product can't be deleted because it's referenced by an existing order, cart, wishlist, or review. Unpublish it instead, or remove those references first.",
      });
    }
    next(error);
  }
});

const ALLOWED_ORDER_STATUSES = ['pending', 'paid', 'fulfilled', 'cancelled'];

router.put('/orders/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isSafeIdentifier(req.params.id)) {
      return res.status(400).json({ message: 'Order ID is invalid.' });
    }
    if (!isRecord(req.body) || typeof req.body.status !== 'string' || !ALLOWED_ORDER_STATUSES.includes(req.body.status)) {
      return res.status(400).json({ message: `Status must be one of: ${ALLOWED_ORDER_STATUSES.join(', ')}.` });
    }

    const existing = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ message: 'Order not found.' });
    }

    const updated = await prisma.order.update({
      where: { id: req.params.id },
      data: { status: req.body.status },
      include: {
        user: { select: { id: true, email: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, slug: true } } } },
      },
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

export default router;
