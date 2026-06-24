import { ConcurrencyLimitError } from "../domain/errors.js";

export class ConcurrencyGate {
  #active = 0;

  constructor(limit) {
    this.limit = limit;
  }

  async run(operation) {
    if (this.#active >= this.limit) {
      throw new ConcurrencyLimitError();
    }
    this.#active += 1;
    try {
      return await operation();
    } finally {
      this.#active -= 1;
    }
  }
}
