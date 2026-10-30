export type BundledImage = string | { readonly src: string };

/** Vite emits asset URLs; Next.js static imports include the URL in `src`. */
export function bundledImageSource(image: BundledImage): string {
  return typeof image === "string" ? image : image.src;
}
