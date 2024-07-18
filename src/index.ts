import type { GameEvents as GE, TypeRestrictions } from './game-base';

export { GameBase, GameAlreadyRunning, GameCanceled, type GameEndEvent, GameEndStatus } from './game-base';
export { newGameErrorClass, type GameErrorInterface, type GameErrorConstructor } from './game-error';

export namespace GameEvents {
    export type Loading = GE<any, any>["loading"];
    export type Loaded = GE<any, any>["loaded"];
    export type Started = GE<any, any>["started"];
    export type End<EndMetadata extends TypeRestrictions.EndMetadata<GN>, GN extends TypeRestrictions.GN> = GE<EndMetadata, GN>["end"];   
}
