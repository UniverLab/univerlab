// The content type each stored audit file is served and kept with, by
// file extension — the same table the command-line push and the
// control-room intake store, so SVG figures display, the PDF opens and
// text evidence reads as text.

/** The content type a stored audit file keeps, from its path extension. */
export function auditContentType(path: string): string {
  const ext = path.split('.').pop()!.toLowerCase();
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'svg': return 'image/svg+xml';
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    case 'avif': return 'image/avif';
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'mp3': return 'audio/mpeg';
    case 'ogg': return 'audio/ogg';
    case 'wav': return 'audio/wav';
    case 'json': return 'application/json; charset=utf-8';
    case 'zip': return 'application/zip';
    case 'txt':
    case 'md': return 'text/plain; charset=utf-8';
    default: return 'application/octet-stream';
  }
}
