import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.findUnique({
    where: { email: 'admin@copytrader.local' },
  });

  if (!existing) {
    const passwordHash = await bcrypt.hash('Admin1234!', 12);
    await prisma.user.create({
      data: {
        email: 'admin@copytrader.local',
        passwordHash,
        name: 'Admin',
        role: 'admin',
      },
    });
    console.log('Seed: usuario admin creado — admin@copytrader.local / Admin1234!');
  } else {
    console.log('Seed: usuario admin ya existe');
  }
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
