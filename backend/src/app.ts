import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import authRoutes from './routes/auth';
import productRoutes from './routes/products';
import orderRoutes from './routes/orders';
import cartRoutes from './routes/cart';
import checkoutRoutes from './routes/checkout';
import adminRoutes from './routes/admin';
import aiRoutes from './routes/ai';
import webhookRoutes from './routes/webhook';
import { errorHandler } from './middleware/errorHandler';

const envPath = path.resolve(process.cwd(), '.env');
const rootEnvPath = path.resolve(__dirname, '../../.env');

dotenv.config({ path: envPath, override: true });
dotenv.config({ path: rootEnvPath, override: true });

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  'http://localhost:3001',
];
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || origin.startsWith('http://localhost:')) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);
app.use('/webhook', webhookRoutes);
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ai', aiRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Backend API is running' });
});

app.use(errorHandler);

export default app;
