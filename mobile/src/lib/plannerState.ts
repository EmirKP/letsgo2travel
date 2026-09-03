export type PlannerInputSnapshot = {
  origin: string;
  days: string;
  month: string;
  budget: string;
  accommodation: string;
  who: string;
  tempo: string;
  vibe: string[];
  visa: string;
};

/**
 * Rota isteğiyle kullanılan tercihleri sonradan değişen form durumundan ayırır.
 * Özellikle `vibe` dizisi kopyalanır; kayıt ve hesap eşitleme her zaman öneriyi
 * gerçekten üreten girdiyi taşır.
 */
export function snapshotPlannerInput<T extends PlannerInputSnapshot>(input: T): T {
  return { ...input, vibe: [...input.vibe] };
}
