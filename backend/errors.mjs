export class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function fail(message, status = 400) {
  throw new ApiError(message, status);
}
