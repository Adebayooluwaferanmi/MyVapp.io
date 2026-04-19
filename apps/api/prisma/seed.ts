import "dotenv/config";

import bcrypt from "bcryptjs";
import {
  ElectionResultsVisibility,
  ElectionStatus,
  MembershipRole,
  PrismaClient,
  UserRole
} from "@prisma/client";

import { slugify } from "../src/lib/slug";

const prisma = new PrismaClient();

async function upsertUser(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}) {
  const passwordHash = await bcrypt.hash(input.password, Number(process.env.BCRYPT_SALT_ROUNDS ?? 12));

  return prisma.user.upsert({
    where: { email: input.email.toLowerCase() },
    update: {
      firstName: input.firstName,
      lastName: input.lastName,
      passwordHash,
      role: input.role
    },
    create: {
      email: input.email.toLowerCase(),
      firstName: input.firstName,
      lastName: input.lastName,
      passwordHash,
      role: input.role
    }
  });
}

async function ensureMembership(organizationId: string, userId: string, role: MembershipRole) {
  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId,
        userId
      }
    },
    update: { role },
    create: {
      organizationId,
      userId,
      role
    }
  });
}

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const organizationName = process.env.SEED_ORGANIZATION_NAME ?? "MyVapp Demo Council";

  if (!email || !password) {
    console.log("Skipping seed: SEED_ADMIN_EMAIL or SEED_ADMIN_PASSWORD is not set.");
    return;
  }

  const admin = await upsertUser({
    email,
    password,
    firstName: "Platform",
    lastName: "Admin",
    role: UserRole.SUPER_ADMIN
  });

  const manager = await upsertUser({
    email: process.env.SEED_MANAGER_EMAIL ?? "manager@myvapp.local",
    password: process.env.SEED_MANAGER_PASSWORD ?? "ChangeMe123!",
    firstName: "Morgan",
    lastName: "Manager",
    role: UserRole.ORG_ADMIN
  });

  const organization = await prisma.organization.upsert({
    where: { slug: slugify(organizationName) },
    update: { name: organizationName },
    create: {
      name: organizationName,
      slug: slugify(organizationName),
      description: "Starter organization for testing election flows."
    }
  });

  await ensureMembership(organization.id, admin.id, MembershipRole.OWNER);
  await ensureMembership(organization.id, manager.id, MembershipRole.ADMIN);

  const electionSlug = slugify("2026 Executive Council Election");
  const existingElection = await prisma.election.findFirst({
    where: {
      organizationId: organization.id,
      slug: electionSlug
    },
    select: {
      id: true
    }
  });

  if (!existingElection) {
    await prisma.election.create({
      data: {
        organizationId: organization.id,
        title: "2026 Executive Council Election",
        slug: electionSlug,
        publicSlug: `${electionSlug}-${organization.id.slice(0, 6)}`,
        description: "Live election for demonstrating election-scoped voter access.",
        status: ElectionStatus.DRAFT,
        resultsVisibilityMode: ElectionResultsVisibility.NONE_DURING_OPEN,
        lockAfterOpen: true,
        invalidatePriorSessionOnNewLogin: false
      }
    });
  }

  console.log(`Seeded admin user ${email} and organization ${organization.name}.`);
  console.log(`Platform admin: ${email} / ${password}`);
  console.log(`Organization manager: ${manager.email} / ${process.env.SEED_MANAGER_PASSWORD ?? "ChangeMe123!"}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
