import { newGameErrorClass } from './game-error';

describe("Test GameError abstract class", () => {
  it("should have the correct static and prototype properties", () => {
    const GameError = newGameErrorClass('Abc');

    // Test if the class extends GameError (not exported)
    const proto = Object.getPrototypeOf(GameError);
    expect(proto.name).toBe("GameError");

    expect(GameError.game).toBe('Abc');
    expect(GameError.name).toBe('AbcGameError');
  });

  it("should have the correct instance properties", () => {
    const GameError = newGameErrorClass('Abc');
    const unknownErr = new Error('test error');
    const gameError = new GameError(unknownErr);
    expect(gameError.game).toBe('Abc');
    expect(gameError.name).toBe('AbcGameError');
    expect(gameError.originalError).toStrictEqual(unknownErr);
    expect(gameError.message).toBe('Error: test error');
    expect(gameError.stack).toContain('test error');
  });

  it("should reuse previous GameError", () => {
    const GameError = newGameErrorClass('Abc');

    const unknownErr = new Error('test error');

    const gameError1 = new GameError(unknownErr);
    expect(gameError1.game).toBe('Abc');
    expect(gameError1.name).toBe('AbcGameError');
    expect(gameError1.originalError).toStrictEqual(unknownErr);

    const s = Symbol();
    (gameError1 as any)[s] = s;

    const gameError2 = new GameError(gameError1);
    expect(gameError2.game).toBe('Abc');
    expect(gameError2.name).toBe('AbcGameError');
    expect(gameError2.originalError).toStrictEqual(unknownErr);
    expect((gameError2 as any)[s]).toStrictEqual(s);
    expect(gameError2.stack).toContain('test error');
  });
});
