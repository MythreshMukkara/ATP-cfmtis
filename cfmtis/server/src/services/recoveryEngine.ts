export type RecoveryAccount = {
  currentBalance: number;
  amountReceived: number;
  isFrozen: boolean;
};

export const calculateRecovery = (fraudAmount: number, accounts: RecoveryAccount[]) => {
  const totals = accounts.reduce(
    (acc, account) => {
      const recoverable = account.currentBalance;
      const withdrawn = Math.max(account.amountReceived - account.currentBalance, 0);
      const lost = account.currentBalance < account.amountReceived * 0.1 ? withdrawn : 0;
      const atRisk = Math.max(account.amountReceived - recoverable - lost, 0);

      acc.recoverable += recoverable;
      acc.atRisk += atRisk;
      acc.lost += lost;

      if (account.isFrozen) {
        acc.frozen += recoverable;
      }

      return acc;
    },
    { recoverable: 0, atRisk: 0, lost: 0, frozen: 0 }
  );

  return {
    ...totals,
    recoveryPct: fraudAmount > 0 ? (totals.recoverable / fraudAmount) * 100 : 0
  };
};
