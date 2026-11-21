/**
 * Minimal logger. Everything goes to stderr so stdout stays free for data.
 * `debug` is silent unless enabled via {@link setVerbose} (`--verbose`).
 */
let verbose = false;

export function setVerbose(enabled: boolean): void {
    verbose = enabled;
}

export const log = {
    info(...args: unknown[]): void {
        console.error(...args);
    },
    warn(...args: unknown[]): void {
        console.error("[warn]", ...args);
    },
    error(...args: unknown[]): void {
        console.error("[error]", ...args);
    },
    debug(...args: unknown[]): void {
        if (verbose) console.error("[debug]", ...args);
    },
};
