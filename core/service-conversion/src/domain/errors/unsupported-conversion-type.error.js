export class UnsupportedConversionTypeError extends Error {
  constructor(type) {
    super(`Unsupported conversion type: ${type}`);
    this.name = 'UnsupportedConversionTypeError';
    this.type = type;
  }
}
