export const maxPdfMegabytes = 50;
export const maxPdfBytes = maxPdfMegabytes * 1024 * 1024;
export const maxPdfSizeLabel = `${maxPdfMegabytes}MB`;

export function pdfSizeErrorMessage() {
  return `PDF must be ${maxPdfSizeLabel} or smaller.`;
}
