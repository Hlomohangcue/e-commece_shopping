import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import { Prisma } from '@prisma/client';
import prisma from '../db';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2026-04-22.dahlia' });
const router = express.Router();

router.post('/', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  const signature = req.headers['stripe-signature'];
  if (!signature) {
    return res.status(400).send('Missing Stripe signature');
  }

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET || '');
  } catch (error) {
    return res.status(400).send(`Webhook error: ${(error as Error).message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any;
    const orderId = session.metadata?.orderId as string | undefined;

    if (orderId) {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const order = await tx.order.findUnique({
          where: { id: orderId },
          include: { items: true },
        });

        if (!order || order.status === 'paid') {
          return;
        }

        for (const item of order.items) {
          const product = await tx.product.findUnique({
            where: { id: item.productId },
          });

          if (!product) {
            throw new Error(`Product not found for order item ${item.id}`);
          }

          if (product.inventory < item.quantity) {
            throw new Error(`Insufficient inventory for product ${product.id}`);
          }

          await tx.product.update({
            where: { id: item.productId },
            data: {
              inventory: {
                decrement: item.quantity,
              },
            },
          });
        }

        await tx.order.update({
          where: { id: orderId },
          data: {
            status: 'paid',
            paymentIntentId: session.payment_intent as string | null,
          },
        });
      });
    }
  }

  res.json({ received: true });
});

export default router;
