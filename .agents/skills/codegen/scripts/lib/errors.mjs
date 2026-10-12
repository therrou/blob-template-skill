export class CodegenError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.details = details;
  }
}
