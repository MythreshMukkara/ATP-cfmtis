import { prisma } from "../prisma/client.js";
import {
  DatasetHoldRow,
  DatasetTransferRow,
  DatasetWithdrawalRow,
  ParsedDataset,
  parseAnalyzerWorkbook
} from "./analyzerWorkbookService.js";
import { getPythonAnalyzerReport } from "./pythonAnalyzer.js";

type CaseBundle = {
  acknowledgementNo: string;
  transfers: DatasetTransferRow[];
  withdrawals: DatasetWithdrawalRow[];
  holds: DatasetHoldRow[];
  bankActions: DatasetHoldRow[];
  smallTransactions: Array<{ acknowledgementNo: string; amount: number; accountNumber?: string }>;
};

type ExistingCaseTarget = {
  id: string;
  complaintId: string;
  fraudAmount: number;
  victimAccount: string;
  victimName: string;
  victimMobile: string;
  bankName: string;
};

type VictimProfile = {
  accountNumber?: string;
  bankName?: string;
  victimName?: string;
  victimMobile?: string;
};

const resolveVictimProfileFromTransfers = (
  transfers: DatasetTransferRow[],
  preferredAccount?: string | null
): VictimProfile | null => {
  if (!preferredAccount) return null;

  const matched = transfers.find(
    (transfer) =>
      accountMatches(transfer.senderAccount, preferredAccount) ||
      accountMatches(transfer.receiverAccount, preferredAccount)
  );

  if (!matched) return null;

  if (accountMatches(matched.senderAccount, preferredAccount)) {
    return {
      accountNumber: matched.senderAccount,
      bankName: matched.senderBankName,
      victimName: matched.senderName ?? matched.victimName,
      victimMobile: matched.senderPhone ?? matched.victimMobile
    };
  }

  return {
    accountNumber: matched.receiverAccount,
    bankName: matched.receiverBankName,
    victimName: matched.receiverName,
    victimMobile: matched.receiverPhone
  };
};

const derivePrimaryVictim = (bundle: CaseBundle, preferredAccount?: string | null) => {
  const transfers = bundle.transfers;
  const preferredProfile = resolveVictimProfileFromTransfers(transfers, preferredAccount);
  if (preferredProfile) {
    return preferredProfile;
  }

  if (!transfers.length) {
    return {
      accountNumber: undefined,
      bankName: undefined,
      victimName: undefined,
      victimMobile: undefined
    };
  }

  const inbound = new Map<string, number>();
  const outbound = new Map<string, number>();
  const sentAmount = new Map<string, number>();
  const profile = new Map<
    string,
    { bankName?: string; victimName?: string; victimMobile?: string; earliest: number }
  >();

  for (const transfer of transfers) {
    inbound.set(transfer.receiverAccount, (inbound.get(transfer.receiverAccount) ?? 0) + 1);
    outbound.set(transfer.senderAccount, (outbound.get(transfer.senderAccount) ?? 0) + 1);
    sentAmount.set(
      transfer.senderAccount,
      (sentAmount.get(transfer.senderAccount) ?? 0) + transfer.amount
    );

    const ts = transfer.timestamp?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const current = profile.get(transfer.senderAccount);
    if (!current || ts < current.earliest) {
      profile.set(transfer.senderAccount, {
        bankName: transfer.senderBankName,
        victimName: transfer.victimName,
        victimMobile: transfer.victimMobile,
        earliest: ts
      });
    }
  }

  const candidates = [...new Set(transfers.map((item) => item.senderAccount))].sort((left, right) => {
    const leftInbound = inbound.get(left) ?? 0;
    const rightInbound = inbound.get(right) ?? 0;
    if (leftInbound === 0 && rightInbound !== 0) return -1;
    if (rightInbound === 0 && leftInbound !== 0) return 1;

    const amountDelta = (sentAmount.get(right) ?? 0) - (sentAmount.get(left) ?? 0);
    if (amountDelta !== 0) return amountDelta;

    const countDelta = (outbound.get(right) ?? 0) - (outbound.get(left) ?? 0);
    if (countDelta !== 0) return countDelta;

    return (profile.get(left)?.earliest ?? Number.MAX_SAFE_INTEGER) - (profile.get(right)?.earliest ?? Number.MAX_SAFE_INTEGER);
  });

  const accountNumber = candidates[0] ?? transfers[0]?.senderAccount;
  const details = accountNumber ? profile.get(accountNumber) : undefined;

  return {
    accountNumber,
    bankName: details?.bankName,
    victimName: details?.victimName,
    victimMobile: details?.victimMobile
  };
};

const riskLevelFromScore = (score: number) => {
  if (score >= 85) return "CRITICAL";
  if (score >= 65) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
};

const digitsOnly = (value?: string | null) => String(value ?? "").replace(/\D+/g, "");
const hasEnoughDigits = (value?: string | null, min = 8) => digitsOnly(value).length >= min;

const accountCandidates = (value?: string | null) => {
  const raw = String(value ?? "").trim();
  if (!raw) return [];

  const candidates = new Set<string>([raw, digitsOnly(raw)]);
  const scientificMatch = raw.match(/^(\d+(?:\.\d+)?)e\+?(\d+)$/i);
  if (scientificMatch) {
    const [, mantissa, exponentText] = scientificMatch;
    const exponent = Number(exponentText);
    const mantissaDigits = mantissa.replace(".", "");
    const decimals = mantissa.includes(".") ? mantissa.length - mantissa.indexOf(".") - 1 : 0;
    const expanded = `${mantissaDigits}${"0".repeat(Math.max(exponent - decimals, 0))}`;
    candidates.add(expanded);
    const stablePrefix = mantissaDigits.slice(0, Math.min(mantissaDigits.length, 6));
    if (stablePrefix) {
      candidates.add(stablePrefix);
    }
  }

  return [...candidates].filter(Boolean);
};

const isReliableAccountInput = (value?: string | null) =>
  accountCandidates(value).some((candidate) => /^\d+$/.test(candidate) && candidate.length >= 8);

const accountMatches = (left?: string | null, right?: string | null) => {
  const leftCandidates = accountCandidates(left);
  const rightCandidates = accountCandidates(right);
  if (!leftCandidates.length || !rightCandidates.length) return false;

  return leftCandidates.some((leftValue) =>
    rightCandidates.some((rightValue) => {
      if (!leftValue || !rightValue) return false;
      return (
        leftValue === rightValue ||
        (leftValue.length >= 6 && rightValue.startsWith(leftValue)) ||
        (rightValue.length >= 6 && leftValue.startsWith(rightValue))
      );
    })
  );
};

const getBundleStartTimestamp = (bundle: CaseBundle) => {
  const timestamps = [
    ...bundle.transfers.map((item) => item.timestamp),
    ...bundle.withdrawals.map((item) => item.timestamp),
    ...bundle.holds.map((item) => item.timestamp),
    ...bundle.bankActions.map((item) => item.timestamp)
  ]
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => left.getTime() - right.getTime());

  return timestamps[0] ?? null;
};

const deriveExposureAmount = (bundle: CaseBundle) => {
  const transferAmount = bundle.transfers.reduce((sum, item) => sum + item.amount, 0);
  const withdrawalAmount = bundle.withdrawals.reduce((sum, item) => sum + item.amount, 0);
  const holdAmount = bundle.holds.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const bankActionAmount = bundle.bankActions.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const smallTransactionAmount = bundle.smallTransactions.reduce((sum, item) => sum + item.amount, 0);

  return Math.max(transferAmount, withdrawalAmount, holdAmount + bankActionAmount, smallTransactionAmount, 0);
};

const buildMoneyTrail = (bundle: CaseBundle, preferredVictimAccount?: string | null) => {
  const transfers = bundle.transfers;
  const participantProfiles = Object.fromEntries(
    transfers.flatMap((item) => [
      [
        item.senderAccount,
        {
          holderName: item.senderName ?? null,
          phoneNumber: item.senderPhone ?? null
        }
      ],
      [
        item.receiverAccount,
        {
          holderName: item.receiverName ?? null,
          phoneNumber: item.receiverPhone ?? null
        }
      ]
    ])
  );

  if (!transfers.length) {
    const accountNodes = [
      ...new Set(
        [
          ...bundle.withdrawals.map((item) => item.accountNumber),
          ...bundle.smallTransactions.map((item) => item.accountNumber)
        ].filter((item): item is string => Boolean(item))
      )
    ].map((account) => ({
      id: account,
      accountNumber: account,
      kind: "ACCOUNT"
    }));

    const bankNodes = [
      ...new Set(
        [...bundle.withdrawals.map((item) => item.bankName), ...bundle.bankActions.map((item) => item.bankName)].filter(
          (item): item is string => Boolean(item)
        )
      )
    ].map((bankName) => ({
      id: `bank:${bankName}`,
      accountNumber: bankName,
      kind: "BANK"
    }));

    const edges = [
      ...bundle.withdrawals
        .filter((item) => item.accountNumber && item.bankName)
        .map((item, index) => ({
          source: item.accountNumber!,
          target: `bank:${item.bankName!}`,
          amount: item.amount,
          txnId: item.referenceId ?? `withdrawal-${index + 1}`,
          layer: 1,
          timestamp: item.timestamp?.toISOString() ?? null,
          relation: `WITHDRAWAL_${item.withdrawalType}`
        })),
      ...bundle.bankActions
        .filter((item) => item.bankName)
        .map((item, index) => ({
          source: `bank:${item.bankName!}`,
          target: bundle.withdrawals.find((withdrawal) => withdrawal.bankName === item.bankName)?.accountNumber ?? bundle.acknowledgementNo,
          amount: item.amount ?? 0,
          txnId: `bank-action-${index + 1}`,
          layer: 2,
          timestamp: item.timestamp?.toISOString() ?? null,
          relation: item.actionType
        }))
    ];

    return {
      nodes: [...accountNodes, ...bankNodes],
      edges,
      path: accountNodes.map((node) => node.id),
      layerDistribution: {},
      flags: {
        splitTransactions: false,
        circularTransfers: false,
        multipleReceivers: false,
        repeatedAccounts: false
      },
      participantProfiles,
      graphMode: "RELATIONSHIP_FALLBACK"
    };
  }

  const nodes = [...new Set(transfers.flatMap((item) => [item.senderAccount, item.receiverAccount]))].map((account) => ({
    id: account,
    accountNumber: account,
    kind: "ACCOUNT"
  }));
  const edges = transfers.map((item) => ({
    source: item.senderAccount,
    target: item.receiverAccount,
    amount: item.amount,
    txnId: item.txnId,
    layer: item.layerLevel,
    timestamp: item.timestamp?.toISOString() ?? null
  }));
  const adjacency = new Map<string, string[]>();
  for (const transfer of transfers) {
    adjacency.set(transfer.senderAccount, [...(adjacency.get(transfer.senderAccount) ?? []), transfer.receiverAccount]);
  }

  const visited = new Set<string>();
  const path: string[] = [];
  const root =
    resolveVictimProfileFromTransfers(transfers, preferredVictimAccount)?.accountNumber ??
    derivePrimaryVictim(bundle, preferredVictimAccount).accountNumber ??
    transfers[0]?.senderAccount;
  const dfs = (node?: string) => {
    if (!node || visited.has(node)) return;
    visited.add(node);
    path.push(node);
    for (const next of adjacency.get(node) ?? []) {
      dfs(next);
    }
  };
  dfs(root);

  const receiverCount = new Map<string, number>();
  const senderCount = new Map<string, number>();
  transfers.forEach((transfer) => {
    senderCount.set(transfer.senderAccount, (senderCount.get(transfer.senderAccount) ?? 0) + 1);
    receiverCount.set(transfer.receiverAccount, (receiverCount.get(transfer.receiverAccount) ?? 0) + 1);
  });

  return {
    nodes,
    edges,
    path,
    layerDistribution: Object.fromEntries(
      transfers.reduce((acc, item) => {
        acc.set(`L${item.layerLevel}`, (acc.get(`L${item.layerLevel}`) ?? 0) + item.amount);
        return acc;
      }, new Map<string, number>())
    ),
    flags: {
      splitTransactions: transfers.some((item) => (senderCount.get(item.senderAccount) ?? 0) > 1),
      circularTransfers: transfers.some((item) =>
        transfers.some(
          (candidate) =>
            candidate.senderAccount === item.receiverAccount &&
            candidate.receiverAccount === item.senderAccount
        )
      ),
      multipleReceivers: [...senderCount.values()].some((count) => count > 2),
      repeatedAccounts: [...receiverCount.values()].some((count) => count > 1)
    },
    participantProfiles,
    graphMode: "TRANSFER"
  };
};

const buildTimeline = (bundle: CaseBundle) => {
  const events = [
    ...bundle.transfers.map((transfer) => ({
      kind: "TRANSFER",
      timestamp: transfer.timestamp,
      label: `${transfer.senderAccount} to ${transfer.receiverAccount}`
    })),
    ...bundle.holds.map((hold) => ({
      kind: "HOLD",
      timestamp: hold.timestamp,
      label: hold.actionType
    })),
    ...bundle.withdrawals.map((withdrawal) => ({
      kind: "WITHDRAWAL",
      timestamp: withdrawal.timestamp,
      label: withdrawal.withdrawalType
    })),
    ...bundle.bankActions.map((action) => ({
      kind: "BANK_ACTION",
      timestamp: action.timestamp,
      label: action.actionType
    }))
  ]
    .filter((event) => event.timestamp)
    .sort((a, b) => a.timestamp!.getTime() - b.timestamp!.getTime());

  const start = events[0]?.timestamp;
  const end = events[events.length - 1]?.timestamp;
  const delayInHours = start && end ? Math.max((end.getTime() - start.getTime()) / 36e5, 0) : 0;

  return {
    events: events.map((event) => ({
      ...event,
      timestamp: event.timestamp?.toISOString() ?? null
    })),
    delayInHours,
    delayCategory: delayInHours < 24 ? "FAST" : delayInHours <= 72 ? "MEDIUM" : "CRITICAL"
  };
};

const buildWithdrawalIntelligence = (withdrawals: DatasetWithdrawalRow[]) => {
  const totalWithdrawn = withdrawals.reduce((sum, item) => sum + item.amount, 0);
  const distribution = Object.fromEntries(
    withdrawals.reduce((acc, item) => {
      acc.set(item.withdrawalType, (acc.get(item.withdrawalType) ?? 0) + item.amount);
      return acc;
    }, new Map<string, number>())
  );
  const atmClusters = withdrawals
    .filter((item) => item.withdrawalType === "ATM" && item.location)
    .reduce((acc, item) => {
      acc[item.location!] = (acc[item.location!] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  return {
    totalWithdrawn,
    withdrawalTypeDistribution: distribution,
    atmLocations: atmClusters,
    aepsHighRisk: withdrawals.filter((item) => item.withdrawalType === "AEPS").length >= 2
  };
};

const buildRecovery = (bundle: CaseBundle, totalAmount: number) => {
  const frozen = bundle.holds
    .filter((item) => item.actionType.includes("HOLD"))
    .reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const reversed = bundle.bankActions
    .filter((item) => item.actionType.includes("FUNDS_NOT_RECEIVED"))
    .reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const withdrawn = bundle.withdrawals.reduce((sum, item) => sum + item.amount, 0);
  const recoveredAmount = frozen + reversed;
  const lostAmount = withdrawn;
  const atRiskAmount = Math.max(totalAmount - recoveredAmount - lostAmount, 0);

  return {
    recoveredAmount,
    lostAmount,
    atRiskAmount,
    recoveryRate: totalAmount > 0 ? recoveredAmount / totalAmount : 0
  };
};

const buildPatterns = (bundle: CaseBundle) => {
  const repeatedAccounts = [...bundle.transfers.map((item) => item.receiverAccount), ...bundle.withdrawals.map((item) => item.accountNumber)]
    .filter((item): item is string => Boolean(item))
    .filter((account, index, array) => array.indexOf(account) !== index);
  const repeatedIfsc = bundle.transfers
    .map((item) => item.receiverIfsc)
    .filter(Boolean)
    .filter((ifsc, index, array) => array.indexOf(ifsc) !== index);

  return {
    repeatedAccounts: [...new Set(repeatedAccounts)],
    repeatedIfsc: [...new Set(repeatedIfsc.filter((item): item is string => Boolean(item)))],
    highFrequencySmallTransactions: bundle.smallTransactions.length,
    muleAccounts: [
      ...new Set(
        bundle.withdrawals
          .map((item) => item.accountNumber)
          .filter((item): item is string => Boolean(item))
      )
    ]
  };
};

const buildRisk = (bundle: CaseBundle, totalAmount: number, timeline: ReturnType<typeof buildTimeline>, withdrawal: ReturnType<typeof buildWithdrawalIntelligence>) => {
  const maxLayer = Math.max(...bundle.transfers.map((item) => item.layerLevel), bundle.withdrawals.length ? 2 : 1);
  const delayFactor = timeline.delayInHours > 72 ? 3 : timeline.delayInHours > 24 ? 2 : 1;
  const withdrawalFlag = withdrawal.totalWithdrawn > 0 ? 1 : 0;
  const amountFactor = totalAmount >= 1000000 ? 4 : totalAmount >= 100000 ? 3 : totalAmount >= 25000 ? 2 : 1;
  const actionDensity = bundle.holds.length + bundle.bankActions.length > 50 ? 2 : bundle.holds.length + bundle.bankActions.length > 10 ? 1 : 0;
  const smallTxnFactor = bundle.smallTransactions.length > 20 ? 1 : 0;
  const riskScore =
    maxLayer * 18 +
    delayFactor * 12 +
    withdrawalFlag * 20 +
    amountFactor * 12 +
    actionDensity * 10 +
    smallTxnFactor * 8;

  return {
    score: Math.min(riskScore, 100),
    level: riskLevelFromScore(Math.min(riskScore, 100)),
    factors: {
      layerLevel: maxLayer,
      delayInHours: timeline.delayInHours,
      withdrawalFlag,
      amount: totalAmount,
      actionDensity,
      smallTransactionCount: bundle.smallTransactions.length
    }
  };
};

const buildBankInsights = (bundle: CaseBundle, recovery: ReturnType<typeof buildRecovery>) => {
  const banks = new Map<string, { name: string; freezeCount: number; responseTimeHours: number[] }>();

  [...bundle.transfers, ...bundle.withdrawals].forEach((item: any) => {
    const bankName = item.receiverBankName ?? item.bankName;
    if (!bankName) return;
    if (!banks.has(bankName)) {
      banks.set(bankName, { name: bankName, freezeCount: 0, responseTimeHours: [] });
    }
  });

  bundle.holds.forEach((hold) => {
    if (!hold.bankName) return;
    const bank = banks.get(hold.bankName) ?? { name: hold.bankName, freezeCount: 0, responseTimeHours: [] };
    bank.freezeCount += 1;
    banks.set(hold.bankName, bank);
  });

  const baseline = getBundleStartTimestamp(bundle);

  bundle.bankActions.forEach((action) => {
    if (!action.bankName || !action.timestamp || !baseline) return;
    const bank = banks.get(action.bankName) ?? { name: action.bankName, freezeCount: 0, responseTimeHours: [] };
    bank.responseTimeHours.push(
      Math.max((action.timestamp.getTime() - baseline.getTime()) / 36e5, 0)
    );
    banks.set(action.bankName, bank);
  });

  return [...banks.values()].map((bank) => ({
    bankName: bank.name,
    freezeCount: bank.freezeCount,
    recoveryRate: recovery.recoveryRate,
    avgResponseTime:
      bank.responseTimeHours.length > 0
        ? bank.responseTimeHours.reduce((sum, value) => sum + value, 0) / bank.responseTimeHours.length
        : 0
  }));
};

const deriveBundleMap = (parsed: ParsedDataset) => {
  const map = new Map<string, CaseBundle>();
  const ensure = (acknowledgementNo: string) => {
    if (!map.has(acknowledgementNo)) {
      map.set(acknowledgementNo, {
        acknowledgementNo,
        transfers: [],
        withdrawals: [],
        holds: [],
        bankActions: [],
        smallTransactions: []
      });
    }
    return map.get(acknowledgementNo)!;
  };

  parsed.transfers.forEach((row) => ensure(row.acknowledgementNo).transfers.push(row));
  parsed.withdrawals.forEach((row) => ensure(row.acknowledgementNo).withdrawals.push(row));
  parsed.holds.forEach((row) => ensure(row.acknowledgementNo).holds.push(row));
  parsed.bankActions.forEach((row) => ensure(row.acknowledgementNo).bankActions.push(row));
  parsed.smallTransactions.forEach((row) => ensure(row.acknowledgementNo).smallTransactions.push(row));
  return map;
};

const calculateBundleAmount = (bundle: CaseBundle) => deriveExposureAmount(bundle);

const calculateBundleEvidenceScore = (bundle: CaseBundle) =>
  bundle.transfers.length * 4 +
  bundle.withdrawals.length * 3 +
  bundle.holds.length * 2 +
  bundle.bankActions.length * 2 +
  bundle.smallTransactions.length;

const selectBundleForExistingCase = (
  caseRecord: ExistingCaseTarget,
  bundleMap: Map<string, CaseBundle>
) => {
  const bundles = [...bundleMap.values()];
  if (!bundles.length) {
    return null;
  }

  const exactComplaintMatch = bundles.find(
    (bundle) => bundle.acknowledgementNo === caseRecord.complaintId
  );
  if (exactComplaintMatch) {
    return exactComplaintMatch;
  }

  if (isReliableAccountInput(caseRecord.victimAccount)) {
    const victimAccountMatch = bundles.find((bundle) =>
      bundle.transfers.some(
        (transfer) =>
          accountMatches(transfer.senderAccount, caseRecord.victimAccount) ||
          accountMatches(transfer.receiverAccount, caseRecord.victimAccount)
      )
    );
    if (victimAccountMatch) {
      return victimAccountMatch;
    }
  }

  const normalizedVictimName = caseRecord.victimName.trim().toLowerCase();
  if (normalizedVictimName) {
    const victimNameMatch = bundles.find((bundle) =>
      bundle.transfers.some(
        (transfer) => transfer.victimName?.trim().toLowerCase() === normalizedVictimName
      )
    );
    if (victimNameMatch) {
      return victimNameMatch;
    }
  }

  const normalizedVictimMobile = caseRecord.victimMobile.trim().toLowerCase();
  if (normalizedVictimMobile) {
    const victimMobileMatch = bundles.find((bundle) =>
      bundle.transfers.some(
        (transfer) => transfer.victimMobile?.trim().toLowerCase() === normalizedVictimMobile
      )
    );
    if (victimMobileMatch) {
      return victimMobileMatch;
    }
  }

  if (caseRecord.fraudAmount > 0 && (!isReliableAccountInput(caseRecord.victimAccount) || !hasEnoughDigits(caseRecord.complaintId))) {
    return bundles
      .slice()
      .sort((left, right) => {
        const amountDelta =
          Math.abs(calculateBundleAmount(left) - caseRecord.fraudAmount) -
          Math.abs(calculateBundleAmount(right) - caseRecord.fraudAmount);
        if (amountDelta !== 0) {
          return amountDelta;
        }
        return calculateBundleEvidenceScore(right) - calculateBundleEvidenceScore(left);
      })[0] ?? null;
  }

  return bundles
    .slice()
    .sort(
      (left, right) => {
        const evidenceDelta = calculateBundleEvidenceScore(right) - calculateBundleEvidenceScore(left);
        if (evidenceDelta !== 0) {
          return evidenceDelta;
        }

        return (
          Math.abs(calculateBundleAmount(left) - caseRecord.fraudAmount) -
          Math.abs(calculateBundleAmount(right) - caseRecord.fraudAmount)
        );
      }
    )[0];
};

const buildDatasetDiagnostics = (bundleMap: Map<string, CaseBundle>) => {
  const bundles = [...bundleMap.values()];
  const acknowledgements = bundles.map((bundle) => ({
    acknowledgementNo: bundle.acknowledgementNo,
    transferCount: bundle.transfers.length,
    withdrawalCount: bundle.withdrawals.length,
    holdCount: bundle.holds.length,
    bankActionCount: bundle.bankActions.length,
    smallTransactionCount: bundle.smallTransactions.length,
    evidenceScore: calculateBundleEvidenceScore(bundle)
  }));
  const dominant = acknowledgements.slice().sort((left, right) => right.evidenceScore - left.evidenceScore)[0];

  const warnings: string[] = [];
  if (acknowledgements.length > 1) {
    warnings.push(
      `Workbook contains ${acknowledgements.length} distinct acknowledgement groups; analysis should prioritize the dominant evidence bundle.`
    );
  }
  if (dominant && dominant.transferCount === 0) {
    warnings.push(
      `Dominant acknowledgement ${dominant.acknowledgementNo} has no money-trail transfer rows; timeline and withdrawal intelligence are available, but transfer graph is incomplete.`
    );
  }

  return {
    acknowledgementCount: acknowledgements.length,
    dominantAcknowledgement: dominant?.acknowledgementNo ?? null,
    acknowledgements,
    warnings
  };
};

const upsertBank = async (name?: string, ifsc?: string) => {
  if (!name) return null;
  const existing = await prisma.bank.findFirst({
    where: {
      name,
      ifsc: ifsc ?? undefined
    }
  });

  if (existing) {
    return existing;
  }

  return prisma.bank.create({
    data: {
      name,
      ifsc
    }
  });
};

const syncBundleToDatabase = async (caseId: string, bundle: CaseBundle) => {
  await prisma.transaction.deleteMany({ where: { caseId } });
  await prisma.withdrawal.deleteMany({ where: { caseId } });
  await prisma.holdAction.deleteMany({ where: { caseId } });
  await prisma.bankAction.deleteMany({ where: { caseId } });

  for (const transfer of bundle.transfers) {
    await prisma.transaction.create({
      data: {
        caseId,
        acknowledgementNo: transfer.acknowledgementNo,
        txnId: transfer.txnId,
        senderAccount: transfer.senderAccount,
        receiverAccount: transfer.receiverAccount,
        amount: transfer.amount,
        timestamp: transfer.timestamp ?? new Date(),
        txnType: transfer.txnType ?? "TRANSFER",
        status: transfer.status ?? "SUCCESS",
        referenceId: transfer.referenceId,
        sourceSheet: "Monthly Transfer",
        layerLevel: transfer.layerLevel,
        senderBankName: transfer.senderBankName,
        receiverBankName: transfer.receiverBankName,
        senderIfsc: transfer.senderIfsc,
        receiverIfsc: transfer.receiverIfsc
      }
    });
  }

  for (const withdrawal of bundle.withdrawals) {
    const bank = await upsertBank(withdrawal.bankName, withdrawal.ifsc);
    await prisma.withdrawal.create({
      data: {
        caseId,
        acknowledgementNo: withdrawal.acknowledgementNo,
        withdrawalType: withdrawal.withdrawalType,
        amount: withdrawal.amount,
        timestamp: withdrawal.timestamp,
        accountNumber: withdrawal.accountNumber,
        location: withdrawal.location,
        atmTerminalId: withdrawal.atmTerminalId,
        deviceId: withdrawal.deviceId,
        referenceId: withdrawal.referenceId,
        sourceSheet: withdrawal.sourceSheet,
        highRiskFlag: withdrawal.withdrawalType === "AEPS" && withdrawal.amount > 10000,
        bankId: bank?.id
      }
    });
  }

  for (const hold of bundle.holds) {
    const bank = await upsertBank(hold.bankName, hold.ifsc);
    await prisma.holdAction.create({
      data: {
        caseId,
        acknowledgementNo: hold.acknowledgementNo,
        actionType: hold.actionType,
        amount: hold.amount,
        timestamp: hold.timestamp,
        status: hold.status,
        remarks: hold.remarks,
        sourceSheet: hold.sourceSheet,
        bankId: bank?.id
      }
    });
  }

  for (const action of bundle.bankActions) {
    const bank = await upsertBank(action.bankName, action.ifsc);
    const responseTimeHours =
      action.timestamp && bundle.transfers[0]?.timestamp
        ? Math.max((action.timestamp.getTime() - bundle.transfers[0].timestamp!.getTime()) / 36e5, 0)
        : null;

    await prisma.bankAction.create({
      data: {
        caseId,
        acknowledgementNo: action.acknowledgementNo,
        actionType: action.actionType,
        status: action.status,
        responseTimeHours: responseTimeHours ?? undefined,
        timestamp: action.timestamp,
        remarks: action.remarks,
        sourceSheet: action.sourceSheet,
        bankId: bank?.id
      }
    });
  }
};

const ensureCase = async (bundle: CaseBundle, officerId: string) => {
  const primaryVictim = derivePrimaryVictim(bundle);
  const totalAmount = deriveExposureAmount(bundle);
  const fraudTimestamp =
    bundle.transfers.map((item) => item.timestamp).find(Boolean) ??
    bundle.withdrawals.map((item) => item.timestamp).find(Boolean) ??
    new Date();

  return prisma.case.upsert({
    where: { complaintId: bundle.acknowledgementNo },
    create: {
      complaintId: bundle.acknowledgementNo,
      fraudType: "Dataset Import",
      fraudAmount: totalAmount,
      victimAccount: primaryVictim.accountNumber ?? `ACK-${bundle.acknowledgementNo}`,
      victimName: primaryVictim.victimName ?? "Imported Complainant",
      victimMobile: primaryVictim.victimMobile ?? "Unknown",
      bankName: primaryVictim.bankName ?? "Unknown Bank",
      fraudTimestamp: fraudTimestamp ?? new Date(),
      description: `Imported from analyzer dataset for acknowledgement ${bundle.acknowledgementNo}.`,
      officerId
    },
    update: {
      fraudAmount: totalAmount,
      fraudTimestamp: fraudTimestamp ?? new Date(),
      victimAccount: primaryVictim.accountNumber ?? undefined,
      victimName: primaryVictim.victimName ?? undefined,
      victimMobile: primaryVictim.victimMobile ?? undefined,
      bankName: primaryVictim.bankName ?? undefined,
      description: `Imported from analyzer dataset for acknowledgement ${bundle.acknowledgementNo}.`
    }
  });
};

const upsertCaseAnalysisRecord = async (
  caseId: string,
  bundle: CaseBundle,
  preferredVictimAccount?: string | null
) => {
  const totalAmount = deriveExposureAmount(bundle);
  const moneyTrail = buildMoneyTrail(bundle, preferredVictimAccount);
  const timeline = buildTimeline(bundle);
  const withdrawalIntelligence = buildWithdrawalIntelligence(bundle.withdrawals);
  const recovery = buildRecovery(bundle, totalAmount);
  const risk = buildRisk(bundle, totalAmount, timeline, withdrawalIntelligence);
  const patternInsights = buildPatterns(bundle);
  const bankInsights = buildBankInsights(bundle, recovery);

  const conflictingAnalysis = await prisma.caseAnalysis.findUnique({
    where: { acknowledgementNo: bundle.acknowledgementNo }
  });

  if (conflictingAnalysis && conflictingAnalysis.caseId !== caseId) {
    await prisma.caseAnalysis.delete({
      where: { id: conflictingAnalysis.id }
    });
  }

  await prisma.caseAnalysis.upsert({
    where: { caseId },
    create: {
      caseId,
      acknowledgementNo: bundle.acknowledgementNo,
      totalAmount,
      layers: moneyTrail.layerDistribution,
      banksInvolved: [...new Set(bankInsights.map((item) => item.bankName))],
      moneyTrail,
      timeline,
      withdrawalIntelligence,
      recovery,
      risk,
      patternInsights,
      bankInsights
    },
    update: {
      acknowledgementNo: bundle.acknowledgementNo,
      totalAmount,
      layers: moneyTrail.layerDistribution,
      banksInvolved: [...new Set(bankInsights.map((item) => item.bankName))],
      moneyTrail,
      timeline,
      withdrawalIntelligence,
      recovery,
      risk,
      patternInsights,
      bankInsights
    }
  });

  return {
    totalAmount,
    moneyTrail,
    timeline,
    withdrawalIntelligence,
    recovery,
    risk,
    patternInsights,
    bankInsights
  };
};

export const ingestAnalyzerDatasetForCase = async (
  filePath: string,
  caseRecord: ExistingCaseTarget
) => {
  const parsed = parseAnalyzerWorkbook(filePath);
  const bundleMap = deriveBundleMap(parsed);
  const bundle = selectBundleForExistingCase(caseRecord, bundleMap);

  if (!bundle) {
    throw new Error("No acknowledgement bundles found in analyzer workbook");
  }

  const primaryVictim = derivePrimaryVictim(bundle, caseRecord.victimAccount);
  const fraudTimestamp =
    bundle.transfers.map((item) => item.timestamp).find(Boolean) ??
    bundle.withdrawals.map((item) => item.timestamp).find(Boolean) ??
    null;
  const totalAmount = calculateBundleAmount(bundle);

  await prisma.case.update({
    where: { id: caseRecord.id },
    data: {
      fraudAmount: totalAmount || caseRecord.fraudAmount,
      fraudTimestamp: fraudTimestamp ?? undefined,
      victimAccount: caseRecord.victimAccount || primaryVictim.accountNumber || undefined,
      bankName: caseRecord.bankName || primaryVictim.bankName || undefined,
      victimName: caseRecord.victimName || primaryVictim.victimName || undefined,
      victimMobile: caseRecord.victimMobile || primaryVictim.victimMobile || undefined
    }
  });

  await syncBundleToDatabase(caseRecord.id, bundle);
  const analysis = await upsertCaseAnalysisRecord(caseRecord.id, bundle, caseRecord.victimAccount);

  return {
    acknowledgementNo: bundle.acknowledgementNo,
    metadata: parsed.metadata,
    ...analysis
  };
};

const round2 = (value: number) => Number(value.toFixed(2));
const round4 = (value: number) => Number(value.toFixed(4));
const normalizeWorkbookFileName = (filePath: string) => {
  const rawFileName = filePath.split("/").pop() ?? filePath;
  return rawFileName.replace(/^\d+-/, "");
};

const normalizeSheetNameForReport = (sheetName: string) => {
  const compact = sheetName.trim().toLowerCase();

  if (compact.includes("money transfer")) return "Money Transfer to";
  if (compact.includes("others less then 500")) return "Others Less Then 500";
  if (compact.includes("transaction put on hold")) return "Transaction put on hold";
  if (compact.includes("withdrawal through atm")) return "Withdrawal through ATM";
  if (compact.includes("cash withdrawal through cheque")) return "Cash Withdrawal through Cheque";
  if (compact.includes("withdrawal through pos")) return "Withdrawal through POS";
  if (compact === "other") return "Other";
  if (compact.includes("aeps")) return "AEPS";
  if (compact.includes("customer se")) return "Withdrawal through Customer Service";
  if (compact.includes("funds not received by cc")) return "Funds Not Received by CC";

  return sheetName.trim();
};

const buildBundleAnalysis = (bundle: CaseBundle) => {
  const totalAmount = calculateBundleAmount(bundle);
  const moneyTrail = buildMoneyTrail(bundle);
  const timeline = buildTimeline(bundle);
  const withdrawalIntelligence = buildWithdrawalIntelligence(bundle.withdrawals);
  const recovery = buildRecovery(bundle, totalAmount);
  const risk = buildRisk(bundle, totalAmount, timeline, withdrawalIntelligence);
  const patternInsights = buildPatterns(bundle);
  const bankInsights = buildBankInsights(bundle, recovery);

  return {
    acknowledgementNo: bundle.acknowledgementNo,
    totalAmount,
    transferCount: bundle.transfers.length,
    withdrawalCount: bundle.withdrawals.length,
    holdCount: bundle.holds.length,
    bankActionCount: bundle.bankActions.length,
    smallTransactionCount: bundle.smallTransactions.length,
    moneyTrail,
    timeline,
    withdrawalIntelligence,
    recovery,
    risk,
    patternInsights,
    bankInsights
  };
};

const buildAnalyzerReport = (
  filePath: string,
  parsed: ParsedDataset,
  diagnostics: ReturnType<typeof buildDatasetDiagnostics>,
  dominantCase: ReturnType<typeof buildBundleAnalysis> | null
) => {
  if (!dominantCase) {
    throw new Error("No dominant case could be derived from workbook");
  }

  const totalWithdrawn = dominantCase.withdrawalIntelligence.totalWithdrawn;
  const distribution = Object.fromEntries(
    Object.entries(dominantCase.withdrawalIntelligence.withdrawalTypeDistribution).map(([channel, amount]) => [
      channel,
      {
        amount: round2(Number(amount)),
        percentage: totalWithdrawn > 0 ? round2((Number(amount) / totalWithdrawn) * 100) : 0
      }
    ])
  );

  const transferDataAvailable = dominantCase.transferCount > 0;
  const withdrawalDataAvailable = dominantCase.withdrawalCount > 0;
  const holdDataAvailable = dominantCase.holdCount > 0;
  const microTransactionDataAvailable = dominantCase.smallTransactionCount > 0;
  const multiChannelWithdrawal =
    Object.keys(dominantCase.withdrawalIntelligence.withdrawalTypeDistribution).length >= 3;
  const chequeDominance =
    Number((dominantCase.withdrawalIntelligence.withdrawalTypeDistribution as Record<string, number>).CHEQUE ?? 0) >
    totalWithdrawn * 0.5;

  const warnings = [
    !transferDataAvailable ? "No money transfer records found for the case -> graph reconstruction limited" : null,
    withdrawalDataAvailable && holdDataAvailable ? "Heavy dependency on withdrawal and hold data" : null,
    diagnostics.acknowledgementCount === 1 ? "Single acknowledgement dominates entire dataset" : null,
    ...diagnostics.warnings
  ].filter((item): item is string => Boolean(item));

  const uniqueWarnings = [...new Set(warnings)];

  return {
    file: normalizeWorkbookFileName(filePath),
    metadata: {
      totalSheets: parsed.metadata.sheets.length,
      sheetNames: parsed.metadata.sheets.map(normalizeSheetNameForReport),
      totalRows: parsed.metadata.totalRows
    },
    diagnostics: {
      totalAcknowledgements: diagnostics.acknowledgementCount,
      dominantAcknowledgement: diagnostics.dominantAcknowledgement,
      dataCompleteness: {
        transferDataAvailable,
        withdrawalDataAvailable,
        holdDataAvailable,
        microTransactionDataAvailable
      },
      counts: {
        transferCount: dominantCase.transferCount,
        withdrawalCount: dominantCase.withdrawalCount,
        holdCount: dominantCase.holdCount,
        bankActionCount: dominantCase.bankActionCount,
        smallTransactionCount: dominantCase.smallTransactionCount
      },
      warnings: uniqueWarnings
    },
    caseSummary: {
      acknowledgementNo: dominantCase.acknowledgementNo,
      financials: {
        totalFraudAmount: round2(dominantCase.totalAmount),
        totalWithdrawn: round2(totalWithdrawn),
        totalRecovered: round2(dominantCase.recovery.recoveredAmount),
        amountAtRisk: round2(dominantCase.recovery.atRiskAmount)
      },
      counts: {
        withdrawals: dominantCase.withdrawalCount,
        holds: dominantCase.holdCount,
        bankActions: dominantCase.bankActionCount,
        microTransactions: dominantCase.smallTransactionCount
      }
    },
    moneyTrail: {
      status: transferDataAvailable ? "AVAILABLE" : "INCOMPLETE",
      reason: transferDataAvailable ? "Transfer-layer records available" : "No transfer-layer data (L1/L2/L3 missing)",
      graphMode: dominantCase.moneyTrail.graphMode,
      possibleInference: transferDataAvailable
        ? ["Direct transfer path available from dataset"]
        : [
            "Money likely distributed across multiple accounts before withdrawal",
            "Layering exists but not recorded in dataset"
          ]
    },
    timeline: {
      totalDelayHours: round2(dominantCase.timeline.delayInHours),
      totalDelayDays: round2(dominantCase.timeline.delayInHours / 24),
      delayCategory: dominantCase.timeline.delayCategory,
      interpretation:
        dominantCase.timeline.delayCategory === "CRITICAL"
          ? [
              "Extremely delayed response",
              "High probability of complete fund dispersion",
              "Recovery efficiency significantly reduced"
            ]
          : dominantCase.timeline.delayCategory === "MEDIUM"
            ? ["Response delay is material", "Partial dispersion likely", "Recovery still possible with focused action"]
            : ["Rapid response window", "Recovery prospects comparatively stronger"]
    },
    withdrawalIntelligence: {
      totalWithdrawn: round2(totalWithdrawn),
      distribution,
      riskFlags: {
        aepsHighRisk: dominantCase.withdrawalIntelligence.aepsHighRisk,
        chequeDominance,
        multiChannelWithdrawal
      }
    },
    recoveryAnalysis: {
      recoveredAmount: round2(dominantCase.recovery.recoveredAmount),
      lostAmount: round2(dominantCase.recovery.lostAmount),
      atRiskAmount: round2(dominantCase.recovery.atRiskAmount),
      recoveryRate: round4(dominantCase.recovery.recoveryRate),
      interpretation: [
        dominantCase.recovery.recoveryRate >= 0.4
          ? "Moderate recovery achieved despite high delay"
          : "Recovery remains limited relative to fraud scale",
        dominantCase.recovery.lostAmount > 0
          ? "Significant amount already withdrawn"
          : "Limited confirmed cash-out observed",
        dominantCase.recovery.atRiskAmount > 0
          ? "Remaining funds at risk if not acted immediately"
          : "Residual exposure currently low"
      ]
    },
    microFraudAnalysis: {
      totalSmallTransactions: dominantCase.smallTransactionCount,
      pattern: dominantCase.smallTransactionCount > 100 ? "HIGH_FREQUENCY_LOW_VALUE" : "LOW_VOLUME",
      insights:
        dominantCase.smallTransactionCount > 100
          ? [
              "Likely bot-driven or bulk phishing activity",
              "Used for testing or distributing fraud load",
              "Indicates organized fraud operation"
            ]
          : ["Micro-transaction activity not dominant in this dataset"]
    },
    holdAnalysis: {
      totalHoldCases: dominantCase.holdCount,
      totalHoldAmount: round2(dominantCase.recovery.recoveredAmount),
      effectiveness: dominantCase.recovery.recoveredAmount > dominantCase.recovery.lostAmount * 0.5 ? "HIGH" : "MODERATE",
      insights: [
        "Large portion of funds intercepted before withdrawal",
        "Early-stage intervention exists but delayed overall action reduces impact"
      ]
    },
    bankActionAnalysis: {
      totalActions: dominantCase.bankActionCount,
      effectivenessBreakdown: {
        effective: ["freeze", "reverse", "refund"],
        ineffective: ["pending", "under investigation"]
      },
      insights: [
        "Limited number of actions compared to total transactions",
        "Action density is low relative to fraud scale",
        "Indicates delayed or insufficient response"
      ]
    },
    riskAssessment: {
      score: dominantCase.risk.score,
      level: dominantCase.risk.level,
      factors: {
        delayImpact: dominantCase.timeline.delayCategory === "CRITICAL" ? "EXTREME" : dominantCase.timeline.delayCategory,
        withdrawalCompleted: dominantCase.recovery.lostAmount > 0,
        multiChannelFraud: multiChannelWithdrawal,
        highAmount: dominantCase.totalAmount >= 100000,
        highFrequencyMicroFraud: dominantCase.smallTransactionCount > 100,
        incompleteMoneyTrail: !transferDataAvailable
      },
      interpretation: [
        "Full-scale fraud case with advanced laundering behavior",
        "Immediate intervention required",
        "High likelihood of organized crime involvement"
      ]
    },
    fraudPattern: {
      type: !transferDataAvailable ? "LAYERED_DISTRIBUTED_FRAUD" : "TRACEABLE_TRANSFER_FRAUD",
      characteristics: [
        "high volume transactions",
        multiChannelWithdrawal ? "multi-channel withdrawal" : "single-channel withdrawal",
        "delayed action response",
        dominantCase.recovery.recoveredAmount > 0 ? "partial recovery" : "limited recovery",
        !transferDataAvailable ? "missing transfer trace" : "transfer trace available"
      ]
    },
    systemGaps: {
      criticalMissing: !transferDataAvailable
        ? ["money trail graph (L1-L3)", "account linkage mapping", "real-time tracking"]
        : ["real-time tracking"],
      dataLimitations: [
        !transferDataAvailable ? "no transfer sheet linkage" : "transfer layer partially available",
        diagnostics.acknowledgementCount === 1 ? "single case dominance" : "multi acknowledgement workbook",
        "incomplete relational mapping"
      ]
    },
    finalVerdict: {
      caseSeverity: dominantCase.risk.level,
      fraudScale: dominantCase.totalAmount >= 1000000 ? "LARGE" : "MEDIUM",
      operationType: multiChannelWithdrawal || dominantCase.smallTransactionCount > 100 ? "ORGANIZED" : "STRUCTURED",
      recoveryStatus:
        dominantCase.recovery.recoveryRate >= 0.7 ? "STRONG" : dominantCase.recovery.recoveryRate >= 0.3 ? "PARTIAL" : "LOW",
      investigationPriority: dominantCase.risk.level === "CRITICAL" ? "HIGH" : "MEDIUM"
    }
  };
};

export const analyzeWorkbookFile = (filePath: string) => {
  const pythonReport = getPythonAnalyzerReport(filePath);
  if (pythonReport) {
    return pythonReport;
  }

  const parsed = parseAnalyzerWorkbook(filePath);
  const bundleMap = deriveBundleMap(parsed);
  const diagnostics = buildDatasetDiagnostics(bundleMap);
  const dominantBundle = diagnostics.dominantAcknowledgement
    ? bundleMap.get(diagnostics.dominantAcknowledgement) ?? null
    : null;
  const dominantCase = dominantBundle ? buildBundleAnalysis(dominantBundle) : null;

  return buildAnalyzerReport(filePath, parsed, diagnostics, dominantCase);
};

export const ingestAnalyzerDataset = async (filePath: string, officerId: string) => {
  const parsed = parseAnalyzerWorkbook(filePath);
  const bundleMap = deriveBundleMap(parsed);
  const results: Array<Record<string, unknown>> = [];

  for (const bundle of bundleMap.values()) {
    const caseRecord = await ensureCase(bundle, officerId);
    await syncBundleToDatabase(caseRecord.id, bundle);
    const { totalAmount, risk } = await upsertCaseAnalysisRecord(caseRecord.id, bundle);

    results.push({
      caseId: caseRecord.id,
      acknowledgementNo: bundle.acknowledgementNo,
      totalAmount,
      riskLevel: risk.level
    });
  }

  return {
    importedCases: results,
    metadata: parsed.metadata
  };
};

export const getAnalyzerSummary = async () => {
  const analyses = await prisma.caseAnalysis.findMany({ include: { case: true } });
  const totalCases = analyses.length;
  const totalAmount = analyses.reduce((sum, item) => sum + item.totalAmount, 0);
  const recoveredAmount = analyses.reduce(
    (sum, item) => sum + Number((item.recovery as any)?.recoveredAmount ?? 0),
    0
  );

  return {
    totalCases,
    totalAmount,
    recoveredAmount,
    criticalCases: analyses.filter((item) => (item.risk as any)?.level === "CRITICAL").length,
    cases: analyses.map((item) => ({
      caseId: item.caseId,
      acknowledgementNo: item.acknowledgementNo,
      totalAmount: item.totalAmount,
      risk: item.risk,
      recovery: item.recovery
    }))
  };
};

export const getBankPerformanceAnalysis = async () => {
  const analyses = await prisma.caseAnalysis.findMany();
  const byBank = new Map<
    string,
    { bankName: string; freezeCount: number; recoveryRate: number[]; response: number[] }
  >();

  analyses.forEach((analysis) => {
    const bankInsights = (analysis.bankInsights as any[]) ?? [];
    bankInsights.forEach((insight) => {
      const current: {
        bankName: string;
        freezeCount: number;
        recoveryRate: number[];
        response: number[];
      } = byBank.get(insight.bankName) ?? {
        bankName: insight.bankName,
        freezeCount: 0,
        recoveryRate: [],
        response: []
      };
      current.freezeCount += Number(insight.freezeCount ?? 0);
      current.recoveryRate.push(Number(insight.recoveryRate ?? 0));
      current.response.push(Number(insight.avgResponseTime ?? 0));
      byBank.set(insight.bankName, current);
    });
  });

  const ranked = [...byBank.values()].map((bank) => ({
    bankName: bank.bankName,
    freezeCount: bank.freezeCount,
    recoveryRate:
      bank.recoveryRate.reduce((sum, value) => sum + value, 0) / Math.max(bank.recoveryRate.length, 1),
    avgResponseTime:
      bank.response.reduce((sum, value) => sum + value, 0) / Math.max(bank.response.length, 1)
  }));

  return {
    banks: ranked.sort((a, b) => b.recoveryRate - a.recoveryRate),
    poorPerformers: [...ranked].sort((a, b) => b.avgResponseTime - a.avgResponseTime).slice(0, 5)
  };
};

export const getCaseAnalysisById = async (caseId: string) =>
  prisma.caseAnalysis.findUnique({
    where: { caseId },
    include: { case: true }
  });

export const getRiskAnalysis = async () => {
  const analyses = await prisma.caseAnalysis.findMany();
  return analyses
    .map((analysis) => ({
      caseId: analysis.caseId,
      acknowledgementNo: analysis.acknowledgementNo,
      risk: analysis.risk,
      totalAmount: analysis.totalAmount
    }))
    .sort((a, b) => Number((b.risk as any)?.score ?? 0) - Number((a.risk as any)?.score ?? 0));
};
