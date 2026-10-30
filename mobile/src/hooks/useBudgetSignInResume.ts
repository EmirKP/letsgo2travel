import { useEffect, useRef } from "react";
import { claimBudgetSignInResume, clearBudgetSignInResume, takeBudgetSignInResume } from "../lib/budgetSignInResume";
import type { BudgetCockpitIntent } from "../lib/budgetCockpitIntent";

export function useBudgetSignInResume({ ownerId, accessToken, loading, recoveryPending, profileComplete, onRequireProfile, onResume }: {
  ownerId: string | null;
  accessToken: string;
  loading: boolean;
  recoveryPending: boolean;
  profileComplete: boolean;
  onRequireProfile: () => void;
  onResume: (intent: BudgetCockpitIntent) => void;
}) {
  const previousOwner = useRef(ownerId);
  useEffect(() => {
    const previous = previousOwner.current;
    previousOwner.current = ownerId;
    if (previous && previous !== ownerId) { clearBudgetSignInResume(); return; }
    if (loading || !ownerId || !accessToken || !claimBudgetSignInResume(ownerId)) return;
    if (recoveryPending || !profileComplete) { onRequireProfile(); return; }
    const intent = takeBudgetSignInResume(ownerId);
    if (intent) onResume(intent);
  }, [ownerId, accessToken, loading, recoveryPending, profileComplete, onRequireProfile, onResume]);
}
