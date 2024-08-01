// TODO: add a middleware to interop the `GameBase` class with svelte-specific
//       logic (examples: binding, async, stores, etc.)

import { EventEmitter } from "eventemitter3";
import { type GameErrorConstructor, type GameErrorInterface, newGameErrorClass } from "./game-error";

export enum GameEndStatus {
  Success = 'success',
  Failure = 'failure',
  Error   = 'error',
}

export namespace TypeRestrictions {
  /**
   * The game name string literal.
   */
  export type GN = string;

  export type EndMetadata<GN extends TypeRestrictions.GN> = {
    [S in GameEndStatus]: S extends GameEndStatus.Error ? GameErrorInterface<GN> : any;
  };
}

/**
 * Event emitted when the game ends.
 *
 * @template EndMetadata - The type of the metadata that will be returned when the game ends.
 */
export type GameEndEvent<
  EndMetadata extends TypeRestrictions.EndMetadata<GN>,
  GN extends TypeRestrictions.GN = TypeRestrictions.GN,
> = {
  [S in GameEndStatus]: {
    status: S;
    metadata: EndMetadata[S];
  };
}[GameEndStatus];

/**
 * Gets thown synchronously when the game is already running and `start` is called.
 */
export const GameAlreadyRunning = Symbol('GameAlreadyRunning');

export const GameCanceled = Symbol('GameCanceled');

/**
 * Events that are emitted by every game.
 * @template EndMetadata - The type of the metadata that will be returned when the game ends.
 */
export interface GameEvents<
  EndMetadata extends TypeRestrictions.EndMetadata<GN>,
  GN extends TypeRestrictions.GN = TypeRestrictions.GN,
> {
  /**
   * Emitted when the game is loading.
   * The payload is either a number between 0 and 100 representing the loading percentage
   * or nothing if the game doesn't report loading progress information.
   */
  loading: [number | undefined];
  loaded: [];
  started: [];
  end: [GameEndEvent<EndMetadata, GN> | typeof GameCanceled];
}

class GameBaseEventEmitter<
  EndMetadata extends TypeRestrictions.EndMetadata<GN>,
  GN extends TypeRestrictions.GN,
> extends EventEmitter<GameEvents<EndMetadata, GN>> {}

interface RunningHandle<
  EndMetadata extends TypeRestrictions.EndMetadata<GN>,
  GN extends TypeRestrictions.GN,
> {
  readonly startPromise: Promise<GameEndEvent<EndMetadata, GN>>;
  readonly cancel: () => void;
}

export type RootElement = HTMLElement | undefined;

/**
 * Base class for games. Games should implement this base class.
 *
 * @template {TypeRestrictions.EndMetadata} EndMetadata The type of the metadata that will be returned when the game ends.
 */
// TODO: create GameBaseInterface interface and make this class implement it
export abstract class GameBase<
  GN extends TypeRestrictions.GN,
  EndMetadata extends TypeRestrictions.EndMetadata<GN>,
> {
  readonly #events = new GameBaseEventEmitter<EndMetadata, GN>();
  public readonly ErrorClass: GameErrorConstructor<GN>;

  protected readonly defaultResetTimeoutMs: number = 5000;
  #loaded = false;
  #loadingPromise: undefined | Promise<void> = undefined;
  #runningHandle: undefined | RunningHandle<EndMetadata, GN> = undefined;
  #resetPromise: undefined | Promise<void> = undefined;
  #lastEnd: undefined | GameEndEvent<EndMetadata, GN> = undefined;
  #rootElement: RootElement;

  constructor(
    /**
     * The name of the game.
     */
    public readonly name: GN,
    /**
     * The root node where the game will be mounted.
     * If null, the game implementation should add a
     * new div to the body and use that as the root.
     */
    rootElement: RootElement,
  ) {
    this.#rootElement = rootElement;
    this.ErrorClass = newGameErrorClass(name);
  }

  protected newError(err: unknown): GameErrorInterface<GN> {
    if (err instanceof this.ErrorClass) return err;
    return new this.ErrorClass(err);
  }

  /**
   * A callback to report the progress of an operation.
   *
   * @callback progressCallback
   * @param {number} progress - The current progress as a percentage.
   */
  #loadingProgressCb = (progress: number) => {
    if (this.#loaded) return;

    this.#events.emit('loading', Math.max(0,Math.min(100, progress)));
  }

  /**
   * Loads the game. Returns a promise that resolves when the game is loaded or rejects on error.
   * If the game has already been loaded, this method does nothing.
   * 
   * This game is called automatically by `start` if it hasn't been called before, so it only needs
   * to be called manually as an optimization.
   */
  public load(): Promise<void> {
    if (this.#loaded) return Promise.resolve();
    if (this.#loadingPromise) return this.#loadingPromise;

    const loadingPromise = (async () => {
      this.#events.emit('loading', undefined);

      await this.loadImpl(this.#loadingProgressCb, this.#rootElement);
      this.#loaded = true;
      this.#events.emit('loaded');
    })();
    loadingPromise.finally(() => {
      this.#loadingPromise = undefined;
    });

    return this.#loadingPromise = loadingPromise;
  }

  /**
   * This method should be implemented by the game. Loads game resources.
   * Unlike `start`, this method only runs once. Games with longer startup times
   * due to heavier resources should implement this to load resources, so:
   * - the game can (optionally) report its loading status separately from the starting status;
   * - the loading logic isn't repeated between multiple starts.
   * As a consequence, the loading operation needs to be pure and stateless.
   *
   * It is called automatically by `start` if it hasn't been called before.
   * It is safe to call this method multiple times.
   * If the method throws an error, the game will emit an error event and reject the promise.
   * A simple game that doesn't require loading should implement this method and leave it empty.
   * 
   * @param {progressCallback} progressCb - A callback that should be called with the loading progress.
   * @param {RootElement} rootElement - The element passed to the constructor, where the game should mount.
   */
  protected abstract loadImpl(progressCb: (progress: number) => void, rootElement: RootElement): Promise<void>;

  /**
   * Starts the game. Returns a promise that resolves when the game starts or rejects on error.
   * `load` and `reset` are automatically called before starting the game.
   * The promise resolves with the end metadata.
   * Events will be emitted and can be used to track the game's progress instead of this promise.
   * If the game is already running, this method throws `GameAlreadyRunning` synchronously.
   * The `reset` method can be used to cancel the game, in which case, this rejects with GameCanceled.
   *
   * @returns {boolean} A promise that resolves when the game ends.
   * @throws {GameAlreadyRunning} If the game is already running (throws synchronously).
   */
  public start(): Promise<GameEndEvent<EndMetadata, GN>> {
    if (this.#runningHandle) throw GameAlreadyRunning;

    this.#lastEnd = undefined;

    /**
     * This callback will cancel the start promise.
     */
    let cancel: () => void;
    const cancelSignal = new Promise<typeof GameCanceled>(res => {
      cancel = () => {
        res(GameCanceled);
      }
    });

    // Wrap the actual game start implementation so the promise can be cancelled
    // in case the game doesn't stop with a reset call.
    const ret = new Promise<GameEndEvent<EndMetadata, GN>>(async (res, rej) => {
      try {
        await this.load();

        const gamePromise = this.startImpl(this.#rootElement);

        // If the game is marked as canceled before it starts, stop waiting for the game to end.
        const cancellableRet = await Promise.race([cancelSignal, gamePromise]);

        // If the game finished before the cancel promise, return the game result.
        if (cancellableRet !== GameCanceled) {
          return res(cancellableRet);
        }

        const resetPromise = this.#resetPromise;
        if (resetPromise instanceof Promise) {
          // If the game was marked as canceled, reject the promise, but first wait for the game to finish
          // gracefully (from its reset implementation) or for the reset promise to end (reset times out).
          await Promise.race([resetPromise, gamePromise]).catch(() => {});
        }
        return rej(GameCanceled);
      } catch (err) {
        return rej(err);
      }
    });

    const currentRunHandle = Object.freeze({
      startPromise: ret,
      cancel: cancel!,
    });

    ret.then((endMetadata: GameEndEvent<EndMetadata, GN>) => {
      this.#lastEnd = endMetadata;
      this.#events.emit("end", endMetadata);
    }).catch(e => {
      if (e === GameCanceled) {
        this.#events.emit("end", GameCanceled);
        return;
      };

      const endMetadata = {
        status: GameEndStatus.Error,
        metadata: this.newError(e),
      };

      this.#lastEnd = endMetadata;
      this.#events.emit("end", endMetadata);
    }).finally(() => {
      // Call cancel to allow the cancel promise to be garbage collected
      cancel();

      if (currentRunHandle !== this.#runningHandle) return;

      this.#runningHandle = undefined;
    });

    this.#runningHandle = currentRunHandle;

    this.#events.emit("started");
    return ret;
  };

  /**
   * This method should be implemented by the game. It should start game logic.
   * It is guaranteed that this method is not called while another one is still running.
   *
   * @param {GameInstanceEmitter<GN, EndMetadata>} emitter - An object used to emit events.
   * @param {RootElement} rootElement - The element passed to the constructor, where the game should mount.
   * @returns {Promise<EndMetadata>} A promise that resolves when the game ends or rejects on error.
   */
  protected abstract startImpl(rootElement: RootElement): Promise<GameEndEvent<EndMetadata, GN>>;

  /**
   * Gets the promise that resolves when the currently running game ends.
   * If the game is not running and hasn't run yet, this method returns undefined.
   * 
   * @returns {GameEndEvent<EndMetadata, GN> | undefined} The last end event, or undefined if the game hasn't ended yet.
   */
  public join(): undefined | Promise<GameEndEvent<EndMetadata, GN>> {
    return this.#runningHandle?.startPromise;
  }

  /**
   * Returns the last game result. If the game hasn't been run yet or has been reset, this method returns undefined.
   * After a reset, the last game result is cleared, so this method will return undefined.
   */
  public get lastGameResult(): undefined | GameEndEvent<EndMetadata, GN> {
    return this.#lastEnd;
  }

  /**
   * End the game. Returns a promise that resolves when the game is reset.
   * If the game is not running, this method only resets the last game state.
   * 
   * The promise returned by `start` or `join` is guaranteed to reject with
   * `GameCanceled` by the end of the timeout passed as a parameter.
   * 
   * @param {number} [timeoutMs=5000] - The maximum time to wait for the game
   *                                    to reset before rejecting the promise
   *                                    anyway and ignoring the promise from
   *                                    the implementation.
   */
  public reset(timeoutMs = this.defaultResetTimeoutMs): Promise<void> {
    if (this.#resetPromise) return this.#resetPromise;

    const resetPromise = this.#doReset(timeoutMs);
    resetPromise.finally(() => {
      this.#resetPromise = undefined;
    });
    this.#resetPromise = resetPromise;

    return resetPromise;
  }

  #resetState(): void {
    this.#runningHandle = undefined;
    this.#lastEnd = undefined;
  }

  #doReset(timeoutMs: number): Promise<void> {
    const runningHandle = this.#runningHandle;

    try {
      // If the game is not running, don't call the game reset implementation.
      // Just reset the state and return.
      if (runningHandle) {
        runningHandle.cancel();

        let timeoutCleanup: () => void;
        return Promise.race([
          new Promise<void>(res => {
            const timeout = setTimeout(res, timeoutMs);
            timeoutCleanup = () => {
              clearTimeout(timeout);
              res();
            };
          }),
          this.resetImpl(),
        ]).then(() => {}, () => {}).finally(timeoutCleanup!);
      }
      return Promise.resolve();
    } finally {
      this.#resetState();
    }
  }

  /**
   * This method must be implemented by the game, and it must cancel the game execution.
   * This method must guarantee that the game is not running when it resolves or rejects.
   * If the game is not running, this method won't be called.
   * Errors during the reset process must be handled by the game. If this promise rejects,
   * the rejected value will be ignored.
   * This method is guaranteed to be called only once for each game run.
   */
  protected abstract resetImpl(): Promise<void>;

  public on<E extends keyof GameEvents<EndMetadata, GN>>(
    event: E,
    listener: (...args: GameEvents<EndMetadata, GN>[E]) => void,
  ) {
    this.#events.on(event, listener);
    return this;
  }

  public once<E extends keyof GameEvents<EndMetadata, GN>>(
    event: E,
    listener: (...args: GameEvents<EndMetadata, GN>[E]) => void,
  ) {
    this.#events.once(event, listener);
    return this;
  }

  public off<E extends keyof GameEvents<EndMetadata, GN>>(
    event: E,
    listener: (...args: GameEvents<EndMetadata, GN>[E]) => void,
  ) {
    this.#events.off(event, listener);
    return this;
  }
}
