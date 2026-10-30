import type { BudgetCockpitIntent } from "../lib/budgetCockpitIntent";
import { CityPriceCatalog } from "../components/CityPriceCatalog";
import { useI18n } from "../lib/i18n";

export function CostsScreen({ onOpenCountryNews, ownerId, onPrepareCockpitBudget }: { onOpenCountryNews: (code: string) => void; ownerId?: string | null; onPrepareCockpitBudget?: (intent: BudgetCockpitIntent) => void }) {
  const { copy } = useI18n();
  return <div className="screen costs-screen ci-screen">
    <header className="costs-compact-header"><h1>{copy("Seyahat bütçem", "My trip budget", "Buxheti i udhëtimit")}</h1></header>
    <CityPriceCatalog key={ownerId || "guest"} onOpenCountryNews={onOpenCountryNews} ownerId={ownerId} onPrepareCockpitBudget={onPrepareCockpitBudget}/>
  </div>;
}
