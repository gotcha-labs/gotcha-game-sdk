const GAME_ERROR_SUFFIX = 'GameError';
type GameErrorSuffix = typeof GAME_ERROR_SUFFIX;

type SuffixGameError<GN extends string> = GN extends `${string}${GameErrorSuffix}` ? GN : `${GN}${GameErrorSuffix}`;
function suffixGameErrorName<GN extends string>(name: GN): SuffixGameError<GN> {
  return (name.endsWith(GAME_ERROR_SUFFIX) ? name : `${name}${GAME_ERROR_SUFFIX}`) as SuffixGameError<GN>;
}

/**
 * Game error static and instance properties.
 */
interface GameErrorProps<GN extends string> {
  readonly game: GN;
  readonly name: SuffixGameError<GN>;
}

/**
 * Constructor for a class that extends `GameError`.
 *
 * @template {string} G - A string literal type with the game name.
 */
// Extends `GameErrorProps` to force the class to have those static properties
export interface GameErrorConstructor<GN extends string> {
  new(originalError: any): GameError<GN>;
  readonly game: GN;
}

export interface GameErrorInterface<GN extends string = string> extends GameErrorProps<GN> {}

/**
 * This class should be the base of game errors. It is not intended to
 * be instantiated directly, but extended and then instantiated.
 *
 * @abstract
 * @template {string} G - A string literal type with the game name.
 * @extends {Error}
 *
 * @see {@link newGameErrorClass}
 *
 * @example &lt;caption>Extending the class&lt;/caption>
 * class PuzzleGameError extends GameError<'Puzzle'> {
 *   public override readonly name = 'PuzzleGameError';
 *   public static readonly game = 'Puzzle';
 *
 *   public constructor(err: unknown) {
 *     super(err, 'Puzzle');
 *   }
 * }
 */
abstract class GameError<GN extends string = string> extends Error implements GameErrorProps<GN> {
  public abstract override readonly name: SuffixGameError<GN>;
  public abstract readonly game: GN;

  protected constructor(public readonly originalError: unknown) {
    super(`${originalError}`);

    if (originalError instanceof GameError) {
      // Copy properties from the original error
      Object.assign(this, originalError as GameError<GN>);
    }
  }
}

/**
 * Factory function to create a class that extends `GameError` with the game name.
 * @param {string} game - The name of the game.
 * @template {string} GN - A string literal type with the game name.
 * @returns {GameErrorConstructor<G>} The class that extends `GameError`.
 */
export function newGameErrorClass<GN extends string>(game: GN): GameErrorConstructor<GN> {
  const name = suffixGameErrorName(game);

  // Create an anonymous class that extends `GameError`.
  // Its name will be set after the class is declared.
  const c: GameErrorConstructor<GN> = class /* `${name}` */ extends GameError<GN> implements GameErrorInterface<GN> {
    public static readonly game = game;

    public override readonly game = game;
    public override readonly name = name;

    constructor(originalError: unknown) {
      super(originalError);
    }
  };

  // Sets the name of the anonymous class, so it will show up in stack traces
  [c, c.constructor].forEach(o => {
    Object.defineProperty(o, 'name', {value: name, configurable: false, writable: false, enumerable: true});
  });

  return c;
}
