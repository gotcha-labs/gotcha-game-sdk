import { GameAlreadyRunning, GameBase, GameCanceled, GameEndEvent, GameEndStatus } from './game-base';
import { GameErrorInterface } from './game-error';

type TestGameEndMetadata<GN extends string> = {
  [GameEndStatus.Success]: {
    readonly score: number;
  };
  [GameEndStatus.Failure]: undefined;
  [GameEndStatus.Error]: GameErrorInterface<GN>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function randBetween(a: number, b: number, int = false): number {
  if (
    Number.isNaN(a) ||
    Number.isNaN(b) ||
    (int && !Number.isSafeInteger(a) && !Number.isSafeInteger(b))
  ) throw new Error("Invalid arguments");
  if (a === b) return a;

  let min = Math.min(a, b);
  let max = Math.max(a, b);

  let rand = min + Math.random() * (max - min + (int ? 1 : Number.EPSILON));

  if (int) {
    rand = Math.round(rand);
  }

  return clamp(rand, min, max);
}

function wait(a: number, b?: number): Promise<void> {
  const ms = b === undefined ? a : randBetween(a, b, false);

  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("Test GameBase class correct implementations", () => {
  abstract class ValidAbstractTestGame<GN extends string> extends GameBase<GN, TestGameEndMetadata<GN>> {
    #running = false;
    loadCalled = 0;
    protected override readonly defaultResetTimeoutMs = 100;

    // Reset while running takes 50ms.
    // Reset while not running takes 10ms.
    protected override async resetImpl(): Promise<void> {
      await wait(10);
      if (!this.#running) return;

      await wait(40);
      this.#running = false;
    }

    // Game finishes between 50ms and 100ms with a score between 85% and 100%.
    protected override async startImpl(): Promise<GameEndEvent<TestGameEndMetadata<GN>, GN>> {
      await wait(50, 100);

      return {
        status: GameEndStatus.Success,
        metadata: {
          score: randBetween(85, 100),
        },
      };
    }

    protected override async loadImpl(_: (progress: number) => void): Promise<void> {
      this.loadCalled++;
      await wait(10, 20);
    }
  }

  class ValidTestGameWithoutProgress extends ValidAbstractTestGame<"ValidTestGameWitoutProgress"> {
    constructor() {
      super("ValidTestGameWitoutProgress", null);
    }
  }

  class ValidTestGameWithProgress extends ValidAbstractTestGame<"ValidTestGameWithProgress"> {
    constructor() {
      super("ValidTestGameWithProgress", null);
    }

    protected override async loadImpl(onProgressCb: (progress: number) => void): Promise<void> {
      await super.loadImpl(onProgressCb);

      for (let i = 0; i <= 100; i += 5) {
        await wait(1);
        onProgressCb(i);
      }
    }
  }

  it("should report events", async () => {
    const game = new ValidTestGameWithProgress();

    let progressArr: (undefined | number)[] = [];
    const onLoadingProgress = jest.fn((progress: number | undefined): void => {
      progressArr.push(progress);
    });
    game.on("loading", onLoadingProgress);

    const onLoaded = jest.fn();
    game.on("loaded", onLoaded);

    const onStarted = jest.fn();
    game.on("started", onStarted);

    type EM = TestGameEndMetadata<"ValidTestGameWithProgress">;

    let endStatus: GameEndEvent<EM> | typeof GameCanceled | undefined = undefined;
    const onEnd = jest.fn((result: GameEndEvent<EM> | typeof GameCanceled) => {
      endStatus = result;
    });
    game.on("end", onEnd);

    // Load the game
    await expect(
      game.load(),
    ).resolves.toBeUndefined();

    // Expect the onLoading callback to have been called 22 times (once with undefined
    // and 21 times with numbers, from 0 to 100, stepping 5 on eaching iteration).
    expect(onLoadingProgress).toHaveBeenCalledTimes(1 + 21);

    expect(progressArr).toEqual([
      undefined,
      0, 5, 10, 15, 20, 25, 30, 35, 40,
      45, 50, 55, 60, 65, 70, 75, 80, 85, 90,
      95, 100,
    ]);

    // Expect the onLoaded callback to have been called once.
    expect(onLoaded).toHaveBeenCalledTimes(1);

    // Start the game
    const startPromise = game.start();

    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(startPromise).toBeInstanceOf(Promise);
    expect(game.join()).toBe(startPromise);

    await expect(
      startPromise,
    ).resolves.toMatchObject({
      status: GameEndStatus.Success,
    });

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(endStatus).not.toBeUndefined();

    const endMetadata = await startPromise;
    expect(endMetadata).toBe(endStatus);
    expect(game.lastGameResult).toBe(endStatus);
    expect(endMetadata.status).toBe(GameEndStatus.Success);
    expect(endMetadata.metadata).toHaveProperty("score");
    const metadata = endMetadata.metadata as EM[GameEndStatus.Success];
    expect(metadata.score).toBeGreaterThanOrEqual(85);
    expect(metadata.score).toBeLessThanOrEqual(100);
  });

  it("should only load once", async () => {
    const game = new ValidTestGameWithoutProgress();

    let progressArr: (undefined | number)[] = [];
    const onLoadingProgress = jest.fn((progress: number | undefined): void => {
      progressArr.push(progress);
    });
    game.on("loading", onLoadingProgress);

    const onLoaded = jest.fn();
    game.on("loaded", onLoaded);

    // Concurrent calls to `game.load` should return the same promise.
    expect(game.load()).toBe(game.load());
    expect(game.load()).toBe(game.load());
    expect(game.load()).toBe(game.load());

    await expect(
      game.load(),
    ).resolves.toBeUndefined();

    expect(onLoadingProgress).toHaveBeenCalledTimes(1);
    expect(onLoaded).toHaveBeenCalledTimes(1);

    await expect(
      game.load(),
    ).resolves.toBeUndefined();

    expect(onLoadingProgress).toHaveBeenCalledTimes(1);
    expect(onLoaded).toHaveBeenCalledTimes(1);
  });

  it("should only allow one start at a time", async () => {
    const game = new ValidTestGameWithoutProgress();

    const startPromise = game.start();
    let thrownValue: any;
    expect(() => {
      try {
        game.start();
      } catch (e) {
        thrownValue = e;
        throw e;
      }
    }).toThrow();
    expect(thrownValue).toBe(GameAlreadyRunning);

    expect(startPromise).toBeInstanceOf(Promise);

    await expect(
      startPromise,
    ).resolves.toBeDefined();
  });

  it("should cancel the game", async () => {
    const game = new ValidTestGameWithoutProgress();

    const onEnd = jest.fn();
    game.on("end", onEnd);

    const startPromise = game.start();

    expect(game.reset()).toBeInstanceOf(Promise);

    // Reset will return the same promise
    expect(game.reset()).toBe(game.reset());
    expect(game.reset()).toBe(game.reset());
    expect(game.reset()).toBe(game.reset());

    await expect(game.reset()).resolves.toBeUndefined();
    await expect(startPromise).rejects.toBe(GameCanceled);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledWith(GameCanceled);
  });
});
