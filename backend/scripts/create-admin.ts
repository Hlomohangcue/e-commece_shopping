import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@demo.com';
  const password = process.env.ADMIN_PASSWORD || 'Demo1234!';
  const name = process.env.ADMIN_NAME || 'Demo Admin';

  const hashed = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: { role: 'admin', password: hashed, name },
    create: { email, password: hashed, name, role: 'admin' },
  });

  console.log('Admin user ready:');
  console.log('  email:   ', user.email);
  console.log('  password:', password, '(plaintext shown once here, not stored)');
  console.log('  role:    ', user.role);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });