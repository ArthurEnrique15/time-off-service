export class Failure<T> {
  readonly value: T;

  private constructor(value: T) {
    this.value = value;
  }

  isFailure(): this is Failure<T> {
    return true;
  }

  isSuccess(): this is Success<never> {
    return false;
  }

  static create<U>(value: U): Failure<U> {
    return new Failure(value);
  }
}

export class Success<T> {
  readonly value: T;

  private constructor(value: T) {
    this.value = value;
  }

  isFailure(): this is Failure<never> {
    return false;
  }

  isSuccess(): this is Success<T> {
    return true;
  }

  static create<U>(value: U): Success<U> {
    return new Success(value);
  }
}

export type Either<F, S> = Failure<F> | Success<S>;
