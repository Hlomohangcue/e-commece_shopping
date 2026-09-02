import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2026-04-22.dahlia' });

export type PaymentLocation = 'lesotho' | 'international';

export interface PaymentConfig {
  paymentMethods: string[];
  currency: string;
  location: PaymentLocation;
}

// Payment configuration by location
const paymentConfigs: Record<PaymentLocation, PaymentConfig> = {
  lesotho: {
    paymentMethods: ['card', 'bank_transfer'],
    currency: 'lsl',
    location: 'lesotho',
  },
  international: {
    paymentMethods: ['card', 'ideal', 'bancontact', 'giropay', 'eps', 'alipay', 'wechat_pay'],
    currency: 'usd',
    location: 'international',
  },
};

export function getPaymentConfig(country: string): PaymentConfig {
  const location = country?.toLowerCase() === 'ls' || country?.toLowerCase() === 'lesotho' 
    ? 'lesotho' 
    : 'international';
  
  return paymentConfigs[location];
}

export async function createCheckoutSession(
  lineItems: Array<any>,
  successUrl: string,
  cancelUrl: string,
  metadata: Record<string, string> = {},
  paymentConfig: PaymentConfig = paymentConfigs.international
) {
  return stripe.checkout.sessions.create({
    payment_method_types: paymentConfig.paymentMethods.filter(
      (method): method is 'card' | 'ideal' | 'bancontact' | 'giropay' | 'eps' | 'alipay' | 'wechat_pay' =>
        method !== 'bank_transfer'
    ) as Array<'card' | 'ideal' | 'bancontact' | 'giropay' | 'eps' | 'alipay' | 'wechat_pay'>,
    mode: 'payment',
    line_items: lineItems,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      ...metadata,
      location: paymentConfig.location,
    },
    billing_address_collection: 'required',
    phone_number_collection: {
      enabled: true,
    },
  });
}

export async function retrievePaymentIntent(paymentIntentId: string) {
  return stripe.paymentIntents.retrieve(paymentIntentId);
}

export async function getExchangeRate(fromCurrency: string, toCurrency: string): Promise<number> {
  // Placeholder for exchange rate calculation
  // In production, integrate with a real exchange rate API
  const rates: Record<string, Record<string, number>> = {
    'lsl': { 'usd': 0.055, 'eur': 0.052, 'gbp': 0.044 },
    'usd': { 'lsl': 18.18, 'eur': 0.92, 'gbp': 0.79 },
    'eur': { 'lsl': 19.23, 'usd': 1.09, 'gbp': 0.86 },
    'gbp': { 'lsl': 22.73, 'usd': 1.27, 'eur': 1.16 },
  };
  
  return rates[fromCurrency.toLowerCase()]?.[toCurrency.toLowerCase()] || 1;
}
