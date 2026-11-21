/**
 * Decides where each argument of an HTTP-bound function goes. The help does not
 * say; these rules reproduce the client's own `/swagger/v3/openapi.json` for every
 * argument it covers (verify with `npm run compare-builtin`):
 *
 * 1. Name appears in the URL as `{name}` or `{+name}`      -> path (required)
 * 2. Primitive and listed in {@link HEADER_PARAMS}           -> header
 * 3. Method is GET                                           -> query
 * 4. Otherwise, among the remaining arguments: the last
 *    non-primitive one is the body; if all are primitive and
 *    exactly one remains, that one is the body               -> body
 *    Everything else                                         -> query
 */
import type {HttpMethod, TypeRef} from "./model.js";

/** Primitive arguments the client reads from request headers (compared case-insensitively). */
export const HEADER_PARAMS: ReadonlySet<string> = new Set(["rchat-blocking", "jwt"]);

export type ArgLocation = "path" | "query" | "header" | "body";

export interface PlacedArgument {
    name: string;
    type: TypeRef;
}

/** Names used as `{name}` or `{+name}` in a URL template, with the greedy (`+`) flag. */
export function urlTemplateVariables(url: string): Map<string, { greedy: boolean }> {
    const vars = new Map<string, { greedy: boolean }>();
    for (const match of url.matchAll(/\{(\+?)([^}]+)\}/g)) {
        vars.set(match[2], {greedy: match[1] === "+"});
    }
    return vars;
}

/** Returns one location per argument, in argument order. */
export function placeArguments(method: HttpMethod, url: string, args: readonly PlacedArgument[]): ArgLocation[] {
    const urlVars = urlTemplateVariables(url);
    const locations: (ArgLocation | undefined)[] = args.map((arg) => {
        if (urlVars.has(arg.name)) return "path";
        if (arg.type.kind === "primitive" && HEADER_PARAMS.has(arg.name.toLowerCase())) return "header";
        if (method === "GET") return "query";
        return undefined;
    });

    const remaining = args.map((_, i) => i).filter((i) => locations[i] === undefined);
    const nonPrimitive = remaining.filter((i) => args[i].type.kind !== "primitive");
    let bodyIndex: number | undefined;
    if (nonPrimitive.length > 0) bodyIndex = nonPrimitive[nonPrimitive.length - 1];
    else if (remaining.length === 1) bodyIndex = remaining[0];

    return locations.map((loc, i) => loc ?? (i === bodyIndex ? "body" : "query"));
}
