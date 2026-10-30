import { useEffect, useState } from "react";
import type { FxQuote } from "../../../lib/travel-assistant/types";
import { usableBudgetRate, type BudgetCurrency } from "../../../lib/country-intelligence/trip-budget";
import { loadQuote, storedQuote } from "./travelAssistant";

/** Refreshes on entry, each new day and reconnection; weekends may return Friday's rate. */
export function useDailyBudgetRate(currency: BudgetCurrency) {
  const [state, setState] = useState<{ currency: string; quote: FxQuote | null; loading: boolean; failed: boolean }>({ currency: "", quote: null, loading: false, failed: false });
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (currency === "GBP") return;
    let current = true, pending = false, attemptedDay = "", failed = false, lastAttempt = 0;
    let quote = storedQuote("GBP", currency);
    const refresh = (reconnected = false) => {
      const time = Date.now(); setNow(time);
      const day = new Date(time).toISOString().slice(0, 10);
      if (pending || !reconnected && attemptedDay === day && (!failed || time - lastAttempt < 3600000)) return;
      pending = true; attemptedDay = day; lastAttempt = time;
      setState({ currency, quote, loading: true, failed: false });
      void loadQuote("GBP", currency).then(value => { if (current) { quote = value; failed = false; setState({ currency, quote, loading: false, failed: false }); } }).catch(() => { if (current) { failed = true; setState({ currency, quote, loading: false, failed: true }); } }).finally(() => { pending = false; });
    };
    const tick = () => refresh(); const reconnect = () => refresh(true);
    refresh();
    const timer = window.setInterval(tick, 60000);
    window.addEventListener("focus", tick); window.addEventListener("online", reconnect);
    return () => { current = false; window.clearInterval(timer); window.removeEventListener("focus", tick); window.removeEventListener("online", reconnect); };
  }, [currency]);
  const quote = state.currency === currency ? state.quote : null;
  return { quote, rate: usableBudgetRate(quote, currency, now), loading: currency !== "GBP" && (state.currency !== currency || state.loading), failed: currency !== "GBP" && state.currency === currency && state.failed };
}
