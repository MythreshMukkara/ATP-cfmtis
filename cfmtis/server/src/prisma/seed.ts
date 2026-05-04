import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const caseId = "cmftis-seed-case-01";
const officerId = "cmftis-seed-officer-01";

async function main() {
  const passwordHash = await bcrypt.hash("Admin@1234", 10);

  await prisma.freezeAction.deleteMany();
  await prisma.patternAlert.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.tracedAccount.deleteMany();
  await prisma.uploadedFile.deleteMany();
  await prisma.case.deleteMany();
  await prisma.officer.deleteMany();

  await prisma.officer.create({
    data: {
      id: officerId,
      badgeNumber: "CID-001",
      name: "Inspector A. Rao",
      rank: "Inspector",
      department: "ananthapur Police |  Cyber Cell",
      passwordHash,
      role: "ADMIN"
    }
  });

  const seededCase = await prisma.case.create({
    data: {
      id: caseId,
      complaintId: "CMP-2026-0328-1174",
      fraudType: "OTP Fraud",
      fraudAmount: 50000,
      victimAccount: "SBI004521987",
      victimName: "Suresh Reddy",
      victimMobile: "9876543210",
      bankName: "State Bank of India",
      fraudTimestamp: new Date("2026-03-28T09:12:00+05:30"),
      description: "Victim reported OTP-enabled unauthorized debit and immediate layered transfers.",
      status: "ACTIVE",
      analysisStatus: "DONE",
      officerId
    }
  });

  const transactions: Array<[string, string, string, number]> = [
    ["TXN-001", "SBI004521987", "HDFC8812345", 22000],
    ["TXN-002", "SBI004521987", "ICICI9934561", 28000],
    ["TXN-003", "HDFC8812345", "PAYTM7761234", 10000],
    ["TXN-004", "HDFC8812345", "AXIS4423678", 12000],
    ["TXN-005", "ICICI9934561", "BOI7712345", 8000],
    ["TXN-006", "ICICI9934561", "KOTAK2298761", 16000],
    ["TXN-007", "PAYTM7761234", "PNB5567890", 5000],
    ["TXN-008", "AXIS4423678", "SBI2233456", 7000],
    ["TXN-009", "BOI7712345", "HDFC3345678", 9000],
    ["TXN-010", "KOTAK2298761", "ICICI1123456", 7000],
    ["TXN-011", "ICICI9934561", "AXIS4423678", 4000]
  ];

  await prisma.transaction.createMany({
    data: transactions.map(([txnId, senderAccount, receiverAccount, amount], index) => ({
      txnId,
      senderAccount,
      receiverAccount,
      amount,
      timestamp: new Date(Date.parse("2026-03-28T09:13:00+05:30") + index * 120000),
      txnType: index === 2 ? "Wallet" : "BANK",
      status: "SUCCESS",
      referenceId: `UTR${1000 + index}`,
      caseId: seededCase.id
    }))
  });

  const accountSeed = [
    ["SBI004521987", "Suresh Reddy", "State Bank of India", 0, 0, 0, 10, "LOW", false, 800, "Hyderabad", 2, 0.1, "VICTIM"],
    ["HDFC8812345", "R. Naik", "HDFC", 2000, 22000, 1, 92, "CRITICAL", false, 12, "Hyderabad", 6, 0.88, "FREEZE RECOMMENDED"],
    ["ICICI9934561", "P. Khan", "ICICI", 0, 28000, 1, 89, "CRITICAL", false, 18, "Warangal / Mismatch", 7, 0.91, "FREEZE RECOMMENDED"],
    ["PAYTM7761234", "Wallet Mule 1", "PAYTM", 5000, 10000, 2, 76, "HIGH", false, 9, "Hyderabad", 4, 0.72, "UNDER REVIEW"],
    ["AXIS4423678", "A. Kumar", "AXIS", 9000, 16000, 2, 84, "HIGH", false, 21, "Delhi / Mismatch", 5, 0.69, "UNDER REVIEW"],
    ["BOI7712345", "S. Das", "BOI", 0, 8000, 2, 67, "HIGH", false, 24, "Vijayawada / Mismatch", 4, 0.65, "UNDER REVIEW"],
    ["KOTAK2298761", "M. Singh", "KOTAK", 9000, 16000, 2, 91, "CRITICAL", false, 6, "Mumbai / Mismatch", 6, 0.81, "FREEZE RECOMMENDED"],
    ["PNB5567890", "P. Verma", "PNB", 5000, 5000, 3, 58, "MEDIUM", false, 44, "Nagpur", 2, 0.25, "WATCH"],
    ["SBI2233456", "L. Joseph", "SBI", 7000, 7000, 3, 49, "MEDIUM", false, 62, "Hyderabad", 2, 0.22, "WATCH"],
    ["HDFC3345678", "N. Babu", "HDFC", 9000, 9000, 3, 43, "MEDIUM", false, 77, "Bengaluru", 1, 0.2, "WATCH"],
    ["ICICI1123456", "D. Paul", "ICICI", 7000, 7000, 4, 31, "LOW", false, 95, "Chennai", 1, 0.12, "LOW RISK"]
  ] as const;

  for (const account of accountSeed) {
    await prisma.tracedAccount.create({
      data: {
        accountNumber: account[0],
        holderName: account[1],
        bankName: account[2],
        currentBalance: account[3],
        amountReceived: account[4],
        chainDepth: account[5],
        riskScore: account[6],
        riskLevel: account[7],
        isFrozen: account[8],
        createdDaysAgo: account[9],
        location: account[10],
        transactionVelocity: account[11],
        fragmentationScore: account[12],
        accountStatus: account[13],
        caseId: seededCase.id
      }
    });
  }

  await prisma.patternAlert.createMany({
    data: [
      {
        type: "FRAGMENTATION",
        severity: "CRITICAL",
        message: "Rapid Fragmentation detected across direct receiver accounts.",
        caseId: seededCase.id
      },
      {
        type: "VELOCITY",
        severity: "HIGH",
        message: "Velocity Spike detected in outbound transfer bursts.",
        caseId: seededCase.id
      },
      {
        type: "LOCATION",
        severity: "MEDIUM",
        message: "Location Anomaly detected between device activity and registration city.",
        caseId: seededCase.id
      },
      {
        type: "NEW_ACCOUNT",
        severity: "HIGH",
        message: "New Account Risk: one or more traced accounts are under 30 days old.",
        caseId: seededCase.id
      }
    ]
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
