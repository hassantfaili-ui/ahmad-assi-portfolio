import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Remove anything the suite left behind, and say so.
 *
 * This is the designed cleanup, not a backstop for a broken one. Two of the
 * unsaved work tests end with a dirty form on purpose, and a dirty form refuses
 * to navigate, which is exactly what they are testing. Deleting through the
 * interface is therefore impossible there and should not be forced.
 *
 * It deletes by the prefix the suite uses, so it can only ever touch scratch
 * data, and it never fails a run: a cleanup problem is not a reason to call a
 * passing suite failed.
 */
export default async function globalTeardown() {
  const url = process.env.DATABASE_URL;
  if (!url) return;

  const db = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: url,
      ...(url.includes('sslmode=require') ? { ssl: { rejectUnauthorized: false } } : {}),
    }),
  });

  try {
    const { count } = await db.project.deleteMany({
      where: { title: { startsWith: 'Test Project ' } },
    });

    if (count > 0) {
      console.log(
        `  Removed ${count} scratch ${count === 1 ? 'project' : 'projects'} left by the suite.`,
      );
    }
  } finally {
    await db.$disconnect();
  }
}
