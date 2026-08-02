export class ConversionJobFailedError extends Error {
  constructor(reason) {
    super(`Conversion job failed: ${reason}`);
    this.name = 'ConversionJobFailedError';
  }
}
