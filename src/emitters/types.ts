import type {ApiModel} from "../model/model.js";

/** Turns the model into one output document. Register new formats in `emitters/index.ts`. */
export interface Emitter {
    /** Used with `--format`. */
    id: string;
    /** File written into the output directory. */
    defaultFileName: string;
    description: string;
    emit(model: ApiModel): object;
}
