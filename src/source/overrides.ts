import * as fs from "node:fs";
import {log} from "../util/log.js";

export const DEFAULT_OVERRIDES_FILE = "./objectNameOverrides.json";

/**
 * Type name overrides (`{"OriginalName": "NewName"}`). Reads `file` if given,
 * otherwise {@link DEFAULT_OVERRIDES_FILE} if it exists.
 */
export function loadNameOverrides(file?: string): Record<string, string> {
    const target = file ?? (fs.existsSync(DEFAULT_OVERRIDES_FILE) ? DEFAULT_OVERRIDES_FILE : undefined);
    if (!target) return {};
    const overrides = JSON.parse(fs.readFileSync(target, "utf-8")) as Record<string, string>;
    log.info(`Using ${Object.keys(overrides).length} type name override(s) from ${target}`);
    return overrides;
}
