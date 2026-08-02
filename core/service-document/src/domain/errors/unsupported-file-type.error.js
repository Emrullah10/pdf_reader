export class UnsupportedFileTypeError extends Error {
  constructor(mime) {
    super(`Unsupported file type: ${mime}`);
    this.name = 'UnsupportedFileTypeError';
    this.mime = mime;
  }
}
