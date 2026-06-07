/** Resize product photo preserving aspect ratio — no center crop. */
const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.88;

export async function optimizeProductImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    let targetW = bitmap.width;
    let targetH = bitmap.height;
    const longest = Math.max(targetW, targetH);
    if (longest > MAX_SIDE) {
      const scale = MAX_SIDE / longest;
      targetW = Math.round(targetW * scale);
      targetH = Math.round(targetH * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');

    ctx.drawImage(bitmap, 0, 0, targetW, targetH);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Could not process image'))),
        'image/jpeg',
        JPEG_QUALITY
      );
    });

    const stem = file.name.replace(/\.[^.]+$/i, '') || 'product';
    return new File([blob], `${stem}.jpg`, { type: 'image/jpeg' });
  } finally {
    bitmap.close();
  }
}
