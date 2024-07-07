// TODO: add a middleware to interop the `GameBase` class with svelte-specific
//       logic (examples: binding, async, stores, etc.)

import EventEmitter from "eventemitter3";
import { type GameErrorConstructor, type GameErrorInterface, newGameErrorClass } from "./game-error";

export enum GameEndStatus {
  Success = 'success',
  Failure = 'failure',
  Canceled = 'canceled',
}

namespace TypeRestrictions {
  /**
   * The game name string literal.
   */
  export type GN = string;

  export type EndMetadata = Record<GameEndStatus, any>;
}
namespace DefaultTypes {
  export type GN = string;

  export type EndMetadata = Record<GameEndStatus, undefined>;
}

/**
 * Event emitted when the game ends.
 *
 * @template EndMetadata - The type of the metadata that will be returned when the game ends.
 */
export interface GameEndEvent<
  EndMetadata extends TypeRestrictions.EndMetadata = DefaultTypes.EndMetadata,
  S extends GameEndStatus = GameEndStatus,
> {
  status: S;
  metadata: EndMetadata[S];
}

/**
 * Events that are emitted by every game.
 * @template EndMetadata - The type of the metadata that will be returned when the game ends.
 */
interface GameBaseEvents<
  GN extends TypeRestrictions.GN = DefaultTypes.GN,
  EndMetadata extends TypeRestrictions.EndMetadata = DefaultTypes.EndMetadata,
  S extends GameEndStatus = GameEndStatus,
> {
  /**
   * Emitted when the game is loading.
   * The payload is either a number between 0 and 100 representing the loading percentage
   * or nothing if the game doesn't report loading progress information.
   */
  loading: EventEmitter.ListenerFn<[] | [number]>;
  loaded: EventEmitter.ListenerFn<[]>;
  /**
   * Emitted when the game is starting.
   * The payload is either a number between 0 and 100 representing the loading percentage
   * or null if the game doesn't report loading progress information.
   */
  starting: EventEmitter.ListenerFn<[]>;
  started: EventEmitter.ListenerFn<[]>;
  error: EventEmitter.ListenerFn<[GameErrorInterface<GN>]>;
  end: EventEmitter.ListenerFn<[GameEndEvent<EndMetadata, S>]>;
}

class GameBaseEventEmitter<
  GN extends TypeRestrictions.GN = DefaultTypes.GN,
  EndMetadata extends TypeRestrictions.EndMetadata = DefaultTypes.EndMetadata
> extends EventEmitter<GameBaseEvents<GN, EndMetadata>> {}

/**
 * Base class for games. Games should implement this base class.
 *
 * @template {TypeRestrictions.EndMetadata} EndMetadata The type of the metadata that will be returned when the game ends.
 */
// TODO: create GameBaseInterface interface and make this class implement it
export abstract class GameBase<
  GN extends TypeRestrictions.GN = DefaultTypes.GN,
  EndMetadata extends TypeRestrictions.EndMetadata = DefaultTypes.EndMetadata,
> {
  public readonly events = new GameBaseEventEmitter<GN, EndMetadata>();
  public readonly ErrorClass: GameErrorConstructor<GN> = newGameErrorClass(this.name);

  #loaded = false;
  #running = false;
  #resetPromise: undefined | Promise<void> = undefined;
  #lastEnd: GameEndEvent<EndMetadata> | null = null;

  constructor(public readonly name: GN) {}

  protected newError = (err: unknown): GameErrorInterface<GN> => {
    if (err instanceof this.ErrorClass) return err;
    return new this.ErrorClass(err);
  }

  /**
   * Load the game. Returns a promise that resolves when the game is loaded or rejects on error.
   * If the game has already been loaded, this method does nothing.
   * If the game doesn't implement loading, this method does nothing.
   */
  async #load(): Promise<void> {
    if (this.#loaded) return;

    const loader = typeof this.loadImpl === 'function' ? this.loadImpl : this.loadImpl?.handler;

    if (!loader) {
      this.#loaded = true;
      return;
    }
    if (this.reportsLoadingProgress) {
      this.events.emit('loading', 0);
    } else {
      this.events.emit('loading');
    }

    try {
      await loader.call(this);
      this.#loaded = true;
      this.events.emit('loaded');
      return;
    } catch (e) {
      this.events.emit('error', this.newError(e));
      throw e;
    }
  }

  /**
   * This method can be optionally implemented by the game to load resources.
   * Unlike `start`, this method only runs once. Games with longer startup times
   * or heavier resources should implement this to load resources, so:
   * - the game can report its loading status separately from the starting status;
   * - the loading logic isn't repeated between multiple starts.
   * A consequence of this is that the loading operation needs to be pure and stateless.
   *
   * It is called automatically by `start` if it hasn't been called before.
   * It is safe to call this method multiple times.
   * If the method throws an error, the game will emit an error event and reject the promise.
   *
   * Unlike `start`, this method only runs once which makes it even more important to separate
   * the loading and starting operations for heavier games.
   */
  protected abstract readonly loadImpl:
    // Null for no loading operation
    | null
    // Function for loading operation with optional `reportsLoadingProgress` property
    // which indicates if the game's loading operation reports progress or not.
    // By default, it is assumed that the loading operation reports progress.
    | {
    (): void | Promise<void>;
    reportsProgress?: boolean;
  }
    // Object for loading operation with optional `reportsLoadingProgress` property
    // which indicates if the game's loading operation reports progress or not.
    // By default, it is assumed that the loading operation reports progress.
    | {
    handler: () => void | Promise<void>;
    reportsProgress?: boolean;
  };

  public get reportsLoadingProgress(): boolean {
    return !!this.loadImpl?.reportsProgress;
  }

  /**
   * Start the game. Returns a promise that resolves when the game starts or rejects on error.
   * The promise resolves with the end metadata.
   * Events will be emitted and can be used to track the game's progress instead of this promise.
   *
   * @param {boolean} [forceRestart = false] - If true, and it's already running,
   * the game will be reset and started again.
   */
  public async start(forceRestart: boolean = false): Promise<void> {
    if (this.#running && !forceRestart) {
      console.warn('Game is already running!');
      return;
    }

    await this.#load();

    const onEndCb: EventEmitter.EventListener<GameBaseEvents<GN, EndMetadata>, "end"> = (endMetadata) => {
      this.#running = false;
      this.#lastEnd = endMetadata;
    };
    try {
      this.events.emit("starting");
      this.events.once("end", onEndCb);
      await this._start();
      this.#running = true;
      this.events.emit("started");
      return;
    } catch (e) {
      const err = this.newError(e);
      this.events.emit("error", err);
      throw err;
    } finally {
      this.events.off("end", onEndCb);
    }
  };

  /**
   * This method should be implemented by the game.
   * It may contain loading logic and should start game logic.
   * It is guaranteed that this method is not called before while another one is still running.
   *
   * @returns {Promise<EndMetadata>} A promise that resolves when the game ends or rejects on error.
   */
  protected abstract _start(): void | Promise<void>;

  /**
   * End the game. Returns a promise that resolves when the game is reset.
   * If the game is not running, this method only resets the last game state.
   *
   * @param {boolean} [infallible = true] - If false, the promise will reject on error during the reset operation.
   * The 'error' event will be emitted in any case.
   */
  public reset(infallible = true): Promise<void> {
    if (this.#resetPromise) return this.#resetPromise;

    this.#resetPromise = this.#doReset(infallible);
    this.#resetPromise.finally(() => {
      this.#resetPromise = undefined;
    });

    return this.#resetPromise;
  }

  async #doReset(infallible: boolean) {
    /** @__INLINE__ */
    const resetState = () => {
      this.#running = false;
      this.#lastEnd = null;
    }

    if (!this.#running) {
      resetState();
      return;
    }

    let err: GameErrorInterface<GN> | undefined;
    try {
      await this._reset();
    } catch (e) {
      err = this.newError(e);
      this.events.emit('error', err);
    }

    resetState();
    if (!infallible && err) throw err;
  }

  /**
   * This method must be implemented by the game, and it must cancel the game execution.
   * This method must guarantee that the game is not running when it resolves or rejects.
   * If the game is not running, this method won't be called.
   * This method must emit the 'end' event with status `GameEndStatus.Cancelled` before resolving or rejecting.
   * Errors during the reset process must not emit an error event, but must instead make this method reject.
   * This method is guaranteed to be called only once for each game run.
   */
  protected abstract _reset(): void | Promise<void>;
}
