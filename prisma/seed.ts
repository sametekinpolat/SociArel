import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const prisma = new PrismaClient();

async function main() {
  // Generate a random one-time password. Never committed to source control —
  // it is printed to stdout once so the admin can sign in and then replace it.
  const tempPassword = crypto.randomBytes(12).toString("base64url");
  const hash = await bcrypt.hash(tempPassword, 12);

  const user = await prisma.user.upsert({
    where: { email: "sametpolat22@istanbularel.edu" },
    update: {},
    create: {
      email: "sametpolat22@istanbularel.edu",
      username: "sep",
      name: "Samet Polat",
      emailVerified: new Date(),
      passwordHash: hash,
      mustSetPassword: true,
    },
  });

  await prisma.globalModerator.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      permissions: {},
    },
  });
  
  console.log("\n================================================");
  console.log("  Admin seeded successfully.");
  console.log("  Email   : sametpolat22@istanbularel.edu");
  console.log(`  Password: ${tempPassword}`);
  console.log("  Sign in with this password once — you will be");
  console.log("  redirected to /onboarding/set-password to set");
  console.log("  a permanent one.");
  console.log("================================================\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
