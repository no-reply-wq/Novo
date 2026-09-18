/**
 * One-time setup: creates the first Platform Admin account.
 *
 * There's no seed script or signup flow for this account type in the
 * project (by design - platform admins shouldn't be self-serve) but
 * that also means there was never a way to create the very first one.
 *
 * Run with: npx tsx scripts/create-platform-admin.ts <email> <password> <name>
 */

import { prisma } from '../src/lib/db/client';
import { hashPassword } from '../src/lib/auth/password';

async function main() {
  const [email, password, name] = process.argv.slice(2);
  if (!email || !password || !name) {
    console.error('Usage: npx tsx scripts/create-platform-admin.ts <email> <password> <name>');
    process.exit(1);
  }

  const existing = await prisma.platformAdmin.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    console.log(`A platform admin with email ${email} already exists.`);
    process.exit(0);
  }

  const passwordHash = await hashPassword(password);
  const admin = await prisma.platformAdmin.create({
    data: { email: email.toLowerCase(), name, passwordHash, active: true },
  });

  console.log(`✅ Platform admin created: ${admin.email} (id: ${admin.id})`);
  console.log(`Log in at /login?mode=admin`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
