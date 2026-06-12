export function isImageAttachment(name: string, mime?: string): boolean {
  if (mime?.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|bmp)$/i.test(name);
}

export function isPdfAttachment(name: string, mime?: string): boolean {
  if (mime === 'application/pdf' || mime?.includes('pdf')) return true;
  return /\.pdf$/i.test(name);
}

export function isPreviewableAttachment(name: string, mime?: string): boolean {
  return isImageAttachment(name, mime) || isPdfAttachment(name, mime);
}
