import { Suspense } from "react";
import SavedPlanDetail from "./saved-plan-detail";

export default function SavedPlanPage() {
  return <Suspense fallback={<p role="status">Plan yükleniyor…</p>}><SavedPlanDetail /></Suspense>;
}
