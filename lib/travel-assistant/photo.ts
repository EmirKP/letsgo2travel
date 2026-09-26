export type PhotoGuide = {
  title: string;
  observation: string;
  context: string;
  uncertain: boolean;
};
export function validatePhotoGuide(value: unknown): PhotoGuide | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const valid = (key: string, max: number) =>
    typeof v[key] === "string" &&
    v[key].trim().length > 0 &&
    v[key].length <= max;
  if (
    !valid("title", 160) ||
    !valid("observation", 1200) ||
    !valid("context", 1800) ||
    typeof v.uncertain !== "boolean"
  )
    return null;
  return {
    title: v.title as string,
    observation: v.observation as string,
    context: v.context as string,
    uncertain: v.uncertain,
  };
}
