import { Either, Failure, Success } from './either';

describe('Either', () => {
  describe('Failure', () => {
    it('creates a Failure with the given value', () => {
      const failure = Failure.create('something went wrong');

      expect(failure.value).toBe('something went wrong');
    });

    it('reports isFailure as true', () => {
      const failure = Failure.create('error');

      expect(failure.isFailure()).toBe(true);
    });

    it('reports isSuccess as false', () => {
      const failure = Failure.create('error');

      expect(failure.isSuccess()).toBe(false);
    });
  });

  describe('Success', () => {
    it('creates a Success with the given value', () => {
      const success = Success.create({ id: '123' });

      expect(success.value).toEqual({ id: '123' });
    });

    it('reports isFailure as false', () => {
      const success = Success.create('data');

      expect(success.isFailure()).toBe(false);
    });

    it('reports isSuccess as true', () => {
      const success = Success.create('data');

      expect(success.isSuccess()).toBe(true);
    });
  });

  describe('type narrowing', () => {
    it('narrows to Success when isSuccess returns true', () => {
      const result: Either<string, number> = Success.create(42);

      if (result.isSuccess()) {
        expect(result.value).toBe(42);
      } else {
        fail('Expected isSuccess to return true');
      }
    });

    it('narrows to Failure when isFailure returns true', () => {
      const result: Either<string, number> = Failure.create('bad');

      if (result.isFailure()) {
        expect(result.value).toBe('bad');
      } else {
        fail('Expected isFailure to return true');
      }
    });
  });
});
