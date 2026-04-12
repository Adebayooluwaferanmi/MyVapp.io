import "dotenv/config";

import bcrypt from "bcryptjs";
import { ElectionStatus, MembershipRole, PrismaClient, UserRole } from "@prisma/client";
import { slugify } from "../src/lib/slug";

const prisma = new PrismaClient();

const demoVoters = [
  {
    email: process.env.SEED_MANAGER_EMAIL ?? "manager@myvapp.local",
    password: process.env.SEED_MANAGER_PASSWORD ?? "ChangeMe123!",
    firstName: "Morgan",
    lastName: "Manager",
    role: UserRole.ORG_ADMIN,
    membershipRole: MembershipRole.ADMIN
  },
  {
    email: process.env.SEED_VOTER_EMAIL ?? "voter1@myvapp.local",
    password: process.env.SEED_VOTER_PASSWORD ?? "ChangeMe123!",
    firstName: "Ada",
    lastName: "Okoye",
    role: UserRole.VOTER,
    membershipRole: MembershipRole.VOTER
  },
  {
    email: "voter2@myvapp.local",
    password: process.env.SEED_VOTER_PASSWORD ?? "ChangeMe123!",
    firstName: "Chika",
    lastName: "Balogun",
    role: UserRole.VOTER,
    membershipRole: MembershipRole.VOTER
  },
  {
    email: "voter3@myvapp.local",
    password: process.env.SEED_VOTER_PASSWORD ?? "ChangeMe123!",
    firstName: "Sade",
    lastName: "Ibrahim",
    role: UserRole.VOTER,
    membershipRole: MembershipRole.VOTER
  }
] as const;

async function ensureMembership(
  organizationId: string,
  userId: string,
  role: MembershipRole
) {
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

async function recreateElection(options: {
  organizationId: string;
  title: string;
  description: string;
  status: ElectionStatus;
  startsAt?: Date;
  endsAt?: Date;
  offices: Array<{
    title: string;
    description: string;
    seats?: number;
    sortOrder?: number;
    candidates: Array<{
      displayName: string;
      bio: string;
    }>;
  }>;
}) {
  const slug = slugify(options.title);

  const existing = await prisma.election.findFirst({
    where: {
      organizationId: options.organizationId,
      slug
    }
  });

  if (existing) {
    await prisma.election.delete({
      where: { id: existing.id }
    });
  }

  return prisma.election.create({
    data: {
      organizationId: options.organizationId,
      title: options.title,
      slug,
      description: options.description,
      status: options.status,
      startsAt: options.startsAt ?? null,
      endsAt: options.endsAt ?? null,
      offices: {
        create: options.offices.map((office) => ({
          title: office.title,
          description: office.description,
          seats: office.seats ?? 1,
          sortOrder: office.sortOrder ?? 0,
          candidates: {
            create: office.candidates
          }
        }))
      }
    },
    include: {
      offices: {
        include: {
          candidates: true
        }
      }
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

  const user = await upsertUser({
    email,
    password,
    firstName: "Platform",
    lastName: "Admin",
    role: UserRole.SUPER_ADMIN
  });

  const organization = await prisma.organization.upsert({
    where: { slug: slugify(organizationName) },
    update: { name: organizationName },
    create: {
      name: organizationName,
      slug: slugify(organizationName),
      description: "Starter organization for testing voting flows."
    }
  });

  await ensureMembership(organization.id, user.id, MembershipRole.OWNER);

  const seededUsers = await Promise.all(
    demoVoters.map(async (entry) => {
      const seededUser = await upsertUser(entry);
      await ensureMembership(organization.id, seededUser.id, entry.membershipRole);

      return {
        ...seededUser,
        membershipRole: entry.membershipRole,
        password: entry.password
      };
    })
  );

  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const openElection = await recreateElection({
    organizationId: organization.id,
    title: "2026 Executive Council Election",
    description: "Live election for demonstrating ballot access and open voting.",
    status: ElectionStatus.OPEN,
    startsAt: now,
    endsAt: nextWeek,
    offices: [
      {
        title: "President",
        description: "Leads the organization and chairs the executive council.",
        sortOrder: 1,
        candidates: [
          {
            displayName: "Amina Bello",
            bio: "Community organizer focused on transparent governance and member engagement."
          },
          {
            displayName: "Tunde Afolabi",
            bio: "Operations lead advocating for stronger volunteer coordination and training."
          }
        ]
      },
      {
        title: "Secretary",
        description: "Maintains records, notices, and key meeting decisions.",
        sortOrder: 2,
        candidates: [
          {
            displayName: "Grace Nwosu",
            bio: "Documentation specialist with experience in election records and audit trails."
          },
          {
            displayName: "Daniel Yusuf",
            bio: "Administrative coordinator focused on process discipline and communication."
          }
        ]
      }
    ]
  });

  const closedElection = await recreateElection({
    organizationId: organization.id,
    title: "2025 Welfare Committee Election",
    description: "Completed election with seeded ballots so result tallies are visible immediately.",
    status: ElectionStatus.CLOSED,
    startsAt: new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000),
    endsAt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
    offices: [
      {
        title: "Welfare Chair",
        description: "Coordinates member support programs and welfare initiatives.",
        sortOrder: 1,
        candidates: [
          {
            displayName: "Ifeoma Eze",
            bio: "Member advocate focused on responsive welfare and emergency support."
          },
          {
            displayName: "Kunle Thomas",
            bio: "Committee volunteer emphasizing structure, access, and accountability."
          }
        ]
      },
      {
        title: "Treasurer",
        description: "Oversees welfare funds, reporting, and budget accountability.",
        sortOrder: 2,
        candidates: [
          {
            displayName: "Rita Mensah",
            bio: "Finance coordinator with a focus on transparent reporting and controls."
          },
          {
            displayName: "Samuel Adeyemi",
            bio: "Budget planner focused on sustainable community finance."
          }
        ]
      }
    ]
  });

  const closedOfficeMap = new Map(
    closedElection.offices.map((office) => [office.title, office])
  );

  const welfareChair = closedOfficeMap.get("Welfare Chair");
  const treasurer = closedOfficeMap.get("Treasurer");

  if (!welfareChair || !treasurer) {
    throw new Error("Closed election seed offices were not created as expected.");
  }

  const resultsBallots = [
    {
      email: seededUsers[1]?.email,
      selections: [
        {
          officeId: welfareChair.id,
          candidateId: welfareChair.candidates[0]?.id
        },
        {
          officeId: treasurer.id,
          candidateId: treasurer.candidates[0]?.id
        }
      ]
    },
    {
      email: seededUsers[2]?.email,
      selections: [
        {
          officeId: welfareChair.id,
          candidateId: welfareChair.candidates[0]?.id
        },
        {
          officeId: treasurer.id,
          candidateId: treasurer.candidates[1]?.id
        }
      ]
    },
    {
      email: seededUsers[3]?.email,
      selections: [
        {
          officeId: welfareChair.id,
          candidateId: welfareChair.candidates[1]?.id
        },
        {
          officeId: treasurer.id,
          candidateId: treasurer.candidates[0]?.id
        }
      ]
    }
  ];

  for (const ballotSeed of resultsBallots) {
    if (!ballotSeed.email) {
      continue;
    }

    const voter = seededUsers.find((entry) => entry.email === ballotSeed.email);

    if (!voter) {
      continue;
    }

    await prisma.ballot.create({
      data: {
        electionId: closedElection.id,
        voterId: voter.id,
        submittedAt: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000),
        votes: {
          create: ballotSeed.selections
            .filter((selection) => selection.officeId && selection.candidateId)
            .map((selection) => ({
              officeId: selection.officeId,
              candidateId: selection.candidateId
            }))
        }
      }
    });
  }

  console.log(`Seeded admin user ${email} and organization ${organization.name}.`);
  console.log(`Open election ready for voting: ${openElection.title}.`);
  console.log(`Closed election ready for result review: ${closedElection.title}.`);
  console.log("Demo credentials:");
  console.log(`- Platform admin: ${email} / ${password}`);

  for (const seededUser of seededUsers) {
    console.log(
      `- ${seededUser.membershipRole.toLowerCase()}: ${seededUser.email} / ${seededUser.password}`
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
