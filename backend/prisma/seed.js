import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Seed default institution
  const institution = await prisma.institution.upsert({
    where: { institution_id: 1 },
    update: {},
    create: {
      name: 'My College',
      checkpoint1_threshold: 75.0,
      checkpoint2_threshold: 85.0,
    },
  });

  console.log(`✅ Institution: ${institution.name}`);
  console.log('✅ Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
