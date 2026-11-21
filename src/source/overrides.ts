import * as fs from "node:fs";
import {DEFAULT_NAME_OVERRIDES} from "../model/defaultOverrides.js";
import {log} from "../util/log.js";

export const OVERRIDES_USAGE = `  --overrides <file>      JSON object renaming help types, {"OriginalName": "NewName"}.
                          Applied on top of the built-in renames; an entry wins over a
                          built-in one, and mapping a name to itself cancels it.`;

/** Reads a user overrides file (`{"OriginalName": "NewName"}`). */
export function loadNameOverrides(file: string): Record<string, string> {
    if (!fs.existsSync(file)) throw new Error(`Overrides file not found: ${file}`);

    let data: unknown;
    try {
        data = JSON.parse(fs.readFileSync(file, "utf-8"));
    } catch (err) {
        throw new Error(`Overrides file ${file} is not valid JSON: ${err instanceof Error ? err.message : err}`);
    }
    if (typeof data !== "object" || data === null || Array.isArray(data)
        || Object.values(data).some((v) => typeof v !== "string")) {
        throw new Error(`Overrides file ${file} must be a JSON object mapping type names to new names, `
            + `e.g. {"OriginalName": "NewName"}`);
    }
    return data as Record<string, string>;
}

/** Built-in renames merged with the user's file (if any); user entries win per name. */
export function resolveNameOverrides(
    file?: string,
    defaults: Readonly<Record<string, string>> = DEFAULT_NAME_OVERRIDES,
): Record<string, string> {
    if (file === undefined) {
        log.debug(`Using ${Object.keys(defaults).length} built-in type name override(s)`);
        return {...defaults};
    }
    const user = loadNameOverrides(file);
    const replaced = Object.keys(user).filter((name) => name in defaults).length;
    log.info(`Using ${Object.keys(user).length} type name override(s) from ${file}`
        + (replaced ? ` (${replaced} replace built-in ones)` : ""));
    return {...defaults, ...user};
}
