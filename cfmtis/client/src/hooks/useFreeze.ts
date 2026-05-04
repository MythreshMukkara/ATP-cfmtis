import { freezeAccountRequest, freezeBulkRequest, unfreezeAccountRequest } from "../api/freeze";
import { useCaseStore } from "../store/caseStore";
import { useGraphStore } from "../store/graphStore";
import { useNotificationStore } from "../store/notificationStore";

export const useFreeze = () => {
  const activeCase = useCaseStore((state) => state.activeCase);
  const markFrozen = useCaseStore((state) => state.markFrozen);
  const unmarkFrozen = useCaseStore((state) => state.unmarkFrozen);
  const riskData = useCaseStore((state) => state.riskData);
  const markNodeFrozen = useGraphStore((state) => state.markNodeFrozen);
  const unmarkNodeFrozen = useGraphStore((state) => state.unmarkNodeFrozen);
  const showNotification = useNotificationStore((state) => state.show);

  const freezeAccount = async (accountId: string) => {
    if (!activeCase) return;
    markFrozen(accountId);
    markNodeFrozen(accountId);
    await freezeAccountRequest(activeCase.id, accountId);
    showNotification("Account frozen successfully.", "success");
  };

  const unfreezeAccount = async (accountId: string) => {
    if (!activeCase) return;
    unmarkFrozen(accountId);
    unmarkNodeFrozen(accountId);
    await unfreezeAccountRequest(activeCase.id, accountId);
    showNotification("Freeze action undone.", "info");
  };

  const freezeCritical = async () => {
    if (!activeCase) return;
    await freezeBulkRequest(activeCase.id);
    riskData
      .filter((account) => account.riskLevel === "CRITICAL" && !account.isFrozen)
      .forEach((account) => {
        markFrozen(account.id);
        markNodeFrozen(account.id);
      });
    showNotification("Critical accounts frozen.", "success");
  };

  return { freezeAccount, unfreezeAccount, freezeCritical };
};
