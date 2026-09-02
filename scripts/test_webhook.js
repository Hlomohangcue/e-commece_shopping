const dotenv = require('dotenv');
const path = require('path');
const Stripe = require('stripe');
const { PrismaClient } = require('@prisma/client');

dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });
dotenv.config({ path: path.resolve(__dirname, '../backend/.env'), override: true });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2026-04-22.dahlia'
});
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { role: 'customer' },
  });

  if (!user) {
    throw new Error('No customer user found to attach an order');
  }

  const product = await prisma.product.findFirst();
  if (!product) {
    throw new Error('No product found to attach to an order');
  }

  const order = await prisma.order.create({
    data: {
      userId: user.id,
      status: 'pending',
      totalAmount: product.price,
      shippingAddress: JSON.stringify({
        fullName: user.name || 'Webhook Tester',
        email: user.email,
        countryCode: 'US'
      }),
      items: {
        create: [
          {
            productId: product.id,
            quantity: 1,
            price: product.price,
          },
        ],
      },
    },
  });

  const payload = {
    id: `evt_test_${Date.now()}`,
    object: 'event',
    api_version: '2026-04-22.dahlia',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `cs_test_${Date.now()}`,
        object: 'checkout.session',
        metadata: { orderId: order.id },
        payment_intent: `pi_test_${Date.now()}`
      }
    },
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: null,
      idempotency_key: null
    },
    type: 'checkout.session.completed'
  };

  const payloadString = JSON.stringify(payload);
  const header = stripe.webhooks.generateTestHeaderString({
    payload: payloadString,
    secret: process.env.STRIPE_WEBHOOK_SECRET || ''
  });

  const response = await fetch('http://localhost:4000/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': header,
    },
    body: payloadString,
  });

  const responseText = await response.text();
  console.log('WEBHOOK_STATUS=', response.status);
  console.log('WEBHOOK_BODY=', responseText);

  const updatedOrder = await prisma.order.findUnique({
    where: { id: order.id }
  });

  console.log('UPDATED_ORDER=', updatedOrder);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
