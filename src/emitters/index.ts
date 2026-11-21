import {asyncApiEmitter} from "./asyncapi.js";
import {openApiEmitter} from "./openapi.js";
import type {Emitter} from "./types.js";

/** All output formats. Adding one = one emitter module + one entry here. */
export const EMITTERS: Readonly<Record<string, Emitter>> = {
    [openApiEmitter.id]: openApiEmitter,
    [asyncApiEmitter.id]: asyncApiEmitter,
};

export type {Emitter} from "./types.js";
