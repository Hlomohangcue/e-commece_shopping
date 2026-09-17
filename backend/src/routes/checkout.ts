import { NextFunction, Request, Response, Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../db';
import { requireAuth } from '../middleware/auth';
import { createCheckoutSession, getPaymentConfig, getExchangeRate } from '../utils/stripe';
import { isHttpUrl, isNonEmptyString, isPositiveInteger, isRecord, isSafeIdentifier } from '../utils/validation';

type CheckoutItem = {
  productId: string;
  quantity: number;
};

type ProductRecord = {
  id: string;
  currency: string;
  name: string;
  description: string;
  price: number;
};

type ShippingAddress = Record<string, unknown> & {
  country?: string;
  countryCode?: string;
  state?: string;
  city?: string;
  postalCode?: string;
};

const router = Router();
router.use(requireAuth);

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isRecord(req.body)) {
      return res.status(400).json({ message: 'Request body must be an object.' });
    }
    const { items, shippingAddress, successUrl, cancelUrl } = req.body as {
      items: CheckoutItem[];
      shippingAddress: ShippingAddress;
      successUrl: string;
      cancelUrl: string;
    };

    if (!Array.isArray(items) || items.length === 0 || items.length > 100 || !items.every((item) =>
      isRecord(item) && isSafeIdentifier(item.productId) && isPositiveInteger(item.quantity)
    )) {
      return res.status(400).json({ message: 'Cart items are required for checkout.' });
    }
    if (!isRecord(shippingAddress) || Object.keys(shippingAddress).length === 0 || !Object.values(shippingAddress).every((value) => isNonEmptyString(value, 200))) {
      return res.status(400).json({ message: 'A valid shipping address is required.' });
    }
    if (!isHttpUrl(successUrl) || !isHttpUrl(cancelUrl)) {
      return res.status(400).json({ message: 'Valid success and cancel URLs are required.' });
    }

    // Determine customer location and payment config
    const countryCode = shippingAddress?.countryCode || shippingAddress?.country || 'US';
    const paymentConfig = getPaymentConfig(countryCode);

    const productIds = items.map((item) => item.productId);
    const products: ProductRecord[] = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, currency: true, name: true, description: true, price: true },
    });

    // Convert product prices to payment currency if needed
    const lineItems = await Promise.all(items.map(async (item) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product) {
        throw Object.assign(new Error(`Product ${item.productId} not found`), { status: 404 });
      }

      let unitAmount = Math.round(product.price * 100);
      let currency = product.currency.toLowerCase();

      // Convert currency if payment location uses different currency
      if (currency !== paymentConfig.currency) {
        const exchangeRate = await getExchangeRate(currency, paymentConfig.currency);
        unitAmount = Math.round(product.price * exchangeRate * 100);
        currency = paymentConfig.currency;
      }

      return {
        price_data: {
          currency,
          product_data: {
            name: product.name,
            description: product.description,
          },
          unit_amount: unitAmount,
        },
        quantity: item.quantity,
      };
    }));

    // Calculate total amount
    let totalAmount = items.reduce((sum, item) => {
      const product = products.find((p) => p.id === item.productId);
      return sum + (product?.price || 0) * item.quantity;
    }, 0);

    // Convert total to payment currency if needed
    const firstProduct = products[0];
    if (firstProduct && firstProduct.currency.toLowerCase() !== paymentConfig.currency) {
      const exchangeRate = await getExchangeRate(
        firstProduct.currency.toLowerCase(),
        paymentConfig.currency
      );
      totalAmount = totalAmount * exchangeRate;
    }

    const order = await prisma.order.create({
      data: {
        userId: req.userId!,
        status: 'pending',
        totalAmount,
        shippingAddress: JSON.stringify(shippingAddress),
        items: {
          create: items.map((item) => {
            const product = products.find((p) => p.id === item.productId);
            return {
              productId: item.productId,
              quantity: item.quantity,
              price: product?.price ?? 0,
            };
          }),
        },
      },
    });

    let session;
    try {
      session = await createCheckoutSession(lineItems, successUrl, cancelUrl, {
        orderId: order.id,
        country: countryCode,
      }, paymentConfig);
    } catch (error) {
      await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
      await prisma.order.delete({ where: { id: order.id } });
      throw error;
    }

    res.json({ url: session.url });
  } catch (error) {
    next(error);
  }
});

export default router;
