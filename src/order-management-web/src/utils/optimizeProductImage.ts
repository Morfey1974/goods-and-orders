/** Center-crop to square and resize for circular product thumbnail (512×512 JPEG). */
const OUTPUT_SIZE = 512;
const JPEG_QUALITY = 0.88;

export async function optimizeProductImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = Math.floor((bitmap.width - side) / 2);
    const sy = Math.floor((bitmap.height - side) / 2);

    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');

    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

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
