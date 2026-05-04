type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type GraphNode = {
  id: string;
  accountNumber: string;
  label: string;
  bankName: string;
  holderName: string;
  amountReceived: number;
  currentBalance: number;
  chainDepth: number;
  riskScore: number;
  riskLevel: RiskLevel;
  nodeType: "Victim" | "Mule" | "Suspect" | "Transfer" | "Frozen" | "Recovered";
  location: string | null;
  isFrozen: boolean;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  amount: number;
  timestamp: string;
  referenceId?: string | null;
};

export type TrailTransaction = {
  id: string;
  from: string;
  to: string;
  amount: number;
  timestamp: Date | null;
  referenceId?: string;
  sourceSheet?: string;
  layer?: number;
  inferred?: boolean;
};

export type TrailAccountNode = {
  id: string;
  accountNumber: string;
  bank: string;
  type: "victim" | "mule" | "suspect";
  depth: number;
  incomingCount: number;
  outgoingCount: number;
  totalIncoming: number;
  totalOutgoing: number;
  withdrawalDetected: boolean;
  inferred: boolean;
};

export type MoneyTrailGraph = {
  nodes: TrailAccountNode[];
  edges: TrailTransaction[];
  rootAccount: string;
  maxDepth: number;
  graphMode: "TRANSFER" | "RELATIONSHIP_FALLBACK";
};

type BuildGraphInput = {
  victimAccount: string;
  transfers: Array<{
    txnId: string;
    senderAccount: string;
    receiverAccount: string;
    amount: number;
    timestamp: Date | null;
    referenceId?: string;
    layerLevel?: number;
    senderBankName?: string;
    receiverBankName?: string;
  }>;
  withdrawals: Array<{
    accountNumber?: string;
    amount: number;
    timestamp: Date | null;
    bankName?: string;
    referenceId?: string;
    sourceSheet: string;
  }>;
  smallTransactions: Array<{
    accountNumber?: string;
    amount: number;
  }>;
  fallbackBankName?: string;
};

const normalizeAccount = (value?: string | null) => {
  const raw = String(value ?? "")
    .trim()
    .replace(/\s+/g, "");
  if (!raw) return "";

  const scientificMatch = raw.match(/^(\d+(?:\.\d+)?)e\+?(\d+)$/i);
  if (!scientificMatch) return raw;

  const [, mantissa, exponentText] = scientificMatch;
  const exponent = Number(exponentText);
  const mantissaDigits = mantissa.replace(".", "");
  const decimals = mantissa.includes(".") ? mantissa.length - mantissa.indexOf(".") - 1 : 0;
  return `${mantissaDigits}${"0".repeat(Math.max(exponent - decimals, 0))}`;
};

const accountCandidates = (value?: string | null) => {
  const normalized = normalizeAccount(value);
  if (!normalized) return [];

  const rawDigits = normalized.replace(/\D+/g, "");
  const candidates = new Set<string>([normalized, rawDigits]);
  if (rawDigits.length >= 6) {
    candidates.add(rawDigits.slice(0, 6));
  }

  return [...candidates].filter(Boolean);
};

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

const inferNodeType = (depth: number, withdrawalDetected: boolean): TrailAccountNode["type"] => {
  if (depth === 0) return "victim";
  if (withdrawalDetected || depth >= 3) return "suspect";
  return "mule";
};

export const getNodeType = (
  riskLevel: RiskLevel,
  chainDepth: number,
  isFrozen: boolean,
  isVictim: boolean
): GraphNode["nodeType"] => {
  if (isVictim) return "Victim";
  if (isFrozen) return "Frozen";
  if (riskLevel === "CRITICAL") return "Suspect";
  if (riskLevel === "HIGH") return "Mule";
  if (chainDepth >= 3) return "Transfer";
  return "Recovered";
};

export const buildMoneyTrailGraph = ({
  victimAccount,
  transfers,
  withdrawals,
  smallTransactions,
  fallbackBankName
}: BuildGraphInput): MoneyTrailGraph => {
  const normalizedTransfers = transfers
    .map((transfer) => ({
      id: transfer.txnId,
      from: normalizeAccount(transfer.senderAccount),
      to: normalizeAccount(transfer.receiverAccount),
      amount: Number(transfer.amount ?? 0),
      timestamp: transfer.timestamp,
      referenceId: transfer.referenceId,
      sourceSheet: "Money Transfer",
      layer: transfer.layerLevel ?? undefined,
      inferred: false,
      fromBank: transfer.senderBankName,
      toBank: transfer.receiverBankName
    }))
    .filter((transfer) => transfer.from && transfer.to && transfer.amount > 0);

  const bankByAccount = new Map<string, string>();
  normalizedTransfers.forEach((transfer) => {
    if (transfer.fromBank) bankByAccount.set(transfer.from, transfer.fromBank);
    if (transfer.toBank) bankByAccount.set(transfer.to, transfer.toBank);
  });
  withdrawals.forEach((withdrawal) => {
    const accountNumber = normalizeAccount(withdrawal.accountNumber);
    if (accountNumber && withdrawal.bankName) {
      bankByAccount.set(accountNumber, withdrawal.bankName);
    }
  });

  const matchedVictimAccount =
    normalizedTransfers.find(
      (transfer) =>
        accountMatches(transfer.from, victimAccount) || accountMatches(transfer.to, victimAccount)
    )?.from ??
    normalizedTransfers.find(
      (transfer) =>
        accountMatches(transfer.to, victimAccount) || accountMatches(transfer.from, victimAccount)
    )?.to;
  const rootAccount = matchedVictimAccount ?? (normalizeAccount(victimAccount) || "UNKNOWN-VICTIM");

  if (!normalizedTransfers.length) {
    const inferredAccounts = new Map<string, { amount: number; withdrawalDetected: boolean }>();

    withdrawals.forEach((withdrawal) => {
      const accountNumber = normalizeAccount(withdrawal.accountNumber);
      if (!accountNumber) return;
      const current = inferredAccounts.get(accountNumber) ?? { amount: 0, withdrawalDetected: false };
      current.amount += Number(withdrawal.amount ?? 0);
      current.withdrawalDetected = true;
      inferredAccounts.set(accountNumber, current);
    });

    smallTransactions.forEach((transaction) => {
      const accountNumber = normalizeAccount(transaction.accountNumber);
      if (!accountNumber) return;
      const current = inferredAccounts.get(accountNumber) ?? { amount: 0, withdrawalDetected: false };
      current.amount += Number(transaction.amount ?? 0);
      inferredAccounts.set(accountNumber, current);
    });

    const edges: TrailTransaction[] = [...inferredAccounts.entries()].map(([account, details], index) => ({
      id: `inferred-${index + 1}`,
      from: rootAccount,
      to: account,
      amount: details.amount,
      timestamp: null,
      sourceSheet: "Inferred Relationship",
      inferred: true
    }));

    const nodes: TrailAccountNode[] = [
      {
        id: rootAccount,
        accountNumber: rootAccount,
        bank: fallbackBankName ?? bankByAccount.get(rootAccount) ?? "Unknown Bank",
        type: "victim",
        depth: 0,
        incomingCount: 0,
        outgoingCount: edges.length,
        totalIncoming: 0,
        totalOutgoing: edges.reduce((sum, edge) => sum + edge.amount, 0),
        withdrawalDetected: false,
        inferred: true
      },
      ...[...inferredAccounts.entries()].map(([account, details]) => ({
        id: account,
        accountNumber: account,
        bank: bankByAccount.get(account) ?? fallbackBankName ?? "Unknown Bank",
        type: inferNodeType(1, details.withdrawalDetected),
        depth: 1,
        incomingCount: 1,
        outgoingCount: 0,
        totalIncoming: details.amount,
        totalOutgoing: 0,
        withdrawalDetected: details.withdrawalDetected,
        inferred: true
      }))
    ];

    return {
      nodes,
      edges,
      rootAccount,
      maxDepth: nodes.length > 1 ? 1 : 0,
      graphMode: "RELATIONSHIP_FALLBACK"
    };
  }

  const adjacency = new Map<string, TrailTransaction[]>();
  const incoming = new Map<string, TrailTransaction[]>();

  normalizedTransfers.forEach((transfer) => {
    adjacency.set(transfer.from, [...(adjacency.get(transfer.from) ?? []), transfer]);
    incoming.set(transfer.to, [...(incoming.get(transfer.to) ?? []), transfer]);
  });

  const victimInGraph = normalizedTransfers.some(
    (transfer) => transfer.from === rootAccount || transfer.to === rootAccount
  );
  const fallbackRoot =
    normalizedTransfers.find((transfer) => !incoming.has(transfer.from))?.from ?? normalizedTransfers[0]?.from ?? rootAccount;
  const selectedRoot = victimInGraph ? rootAccount : fallbackRoot;

  const visited = new Set<string>();
  const depthMap = new Map<string, number>([[selectedRoot, selectedRoot === rootAccount ? 0 : 1]]);
  const queue = [selectedRoot];

  while (queue.length) {
    const account = queue.shift()!;
    if (visited.has(account)) continue;
    visited.add(account);

    for (const edge of adjacency.get(account) ?? []) {
      const nextDepth = (depthMap.get(account) ?? 0) + 1;
      const currentDepth = depthMap.get(edge.to);
      if (currentDepth === undefined || nextDepth < currentDepth) {
        depthMap.set(edge.to, nextDepth);
      }
      if (!visited.has(edge.to)) {
        queue.push(edge.to);
      }
    }
  }

  const reachableAccounts = new Set<string>([...depthMap.keys(), selectedRoot]);
  const edges = normalizedTransfers.filter(
    (transfer) => reachableAccounts.has(transfer.from) && reachableAccounts.has(transfer.to)
  );

  const nodes: TrailAccountNode[] = [...reachableAccounts].map((account) => {
    const incomingEdges = edges.filter((edge) => edge.to === account);
    const outgoingEdges = edges.filter((edge) => edge.from === account);
    const withdrawalDetected = withdrawals.some(
      (withdrawal) => normalizeAccount(withdrawal.accountNumber) === account
    );
    const depth = account === rootAccount ? 0 : depthMap.get(account) ?? 1;

    return {
      id: account,
      accountNumber: account,
      bank: bankByAccount.get(account) ?? fallbackBankName ?? "Unknown Bank",
      type: account === rootAccount ? "victim" : inferNodeType(depth, withdrawalDetected),
      depth,
      incomingCount: incomingEdges.length,
      outgoingCount: outgoingEdges.length,
      totalIncoming: incomingEdges.reduce((sum, edge) => sum + edge.amount, 0),
      totalOutgoing: outgoingEdges.reduce((sum, edge) => sum + edge.amount, 0),
      withdrawalDetected,
      inferred: false
    };
  });

  return {
    nodes,
    edges,
    rootAccount,
    maxDepth: Math.max(...nodes.map((node) => node.depth), 0),
    graphMode: "TRANSFER"
  };
};
