// The qrcode dependency ships no TypeScript definitions; this declares the
// single entry point the seal page uses: the pure module matrix, never the
// renderers (their browser build needs a canvas, which workerd has not).
declare module 'qrcode' {
  const QRCode: {
    create(
      text: string,
      opts?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' },
    ): { modules: { size: number; data: Uint8Array } };
  };
  export default QRCode;
}
