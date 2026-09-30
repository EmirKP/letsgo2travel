export async function prepareImage(file: File): Promise<string> {
  const heic = /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
  if (
    (!["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(file.type) && !(file.type === "" && /\.(jpe?g|png|webp|hei[cf])$/i.test(file.name))) ||
    file.size > 12_000_000
  )
    throw new Error("image");
  const url = URL.createObjectURL(file);
  let decodeTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const image = new Image();
    image.src = url;
    await Promise.race([
      image.decode().catch(() => { throw new Error(heic ? "heic" : "image"); }),
      new Promise<never>((_, reject) => {
        decodeTimer = setTimeout(() => reject(new Error(heic ? "heic" : "image")), 10000);
      }),
    ]);
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 50_000_000)
      throw new Error("image");
    const ratio = Math.min(
      1,
      1280 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("image");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let data = canvas.toDataURL("image/jpeg", 0.8);
    for (const quality of [0.7, 0.6, 0.5]) {
      if (data.length <= 1_320_000) break;
      data = canvas.toDataURL("image/jpeg", quality);
    }
    if (data.length > 1_320_000) throw new Error("image");
    return data;
  } finally {
    if (decodeTimer) clearTimeout(decodeTimer);
    URL.revokeObjectURL(url);
  }
}
