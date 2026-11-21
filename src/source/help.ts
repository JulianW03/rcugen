/**
 * Raw shapes of the Riot Client's self-description and the snapshot we keep of it.
 *
 * - `GET /help?format=Full` is the source for types and signatures: flat type list,
 *   every argument/field/return is `{type, elementType}`.
 * - `GET /help?format=Console` is only used for the HTTP binding of each function
 *   (`http_method`, `url`, `usage`); everything else in it is redundant with Full.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type {RiotClient} from "./client.js";

/** `{type, elementType}` as used by the Full format. See `model/typeRefs.ts`. */
export interface RawTypeRef {
    type: string;
    elementType: string;
}

export interface RawField {
    name: string;
    description: string;
    optional: boolean;
    offset: number;
    type: RawTypeRef;
}

export interface RawEnumValue {
    name: string;
    value: number;
    description: string;
}

export interface RawType {
    name: string;
    description: string;
    nameSpace: string;
    size: number;
    tags: string[];
    /** Non-empty for object types. */
    fields: RawField[];
    /** Non-empty for enum types. */
    values: RawEnumValue[];
}

export interface RawArgument {
    name: string;
    description: string;
    optional: boolean;
    type: RawTypeRef;
}

export interface RawFunction {
    name: string;
    description: string;
    help: string;
    deprecated: boolean;
    deprecatedHelp: string;
    internal: boolean;
    nameSpace: string;
    arguments: RawArgument[];
    /** `{type: ""}` means the function returns nothing. */
    returns: RawTypeRef;
    subscribable: boolean;
    tags: string[];
    threadSafe: boolean;
}

export interface RawEvent {
    name: string;
    description: string;
    nameSpace: string;
    tags: string[];
    type: RawTypeRef;
}

export interface RawFullHelp {
    types: RawType[];
    functions: RawFunction[];
    events: RawEvent[];
}

/** The subset of a Console-format function we use. */
export interface RawConsoleFunction {
    http_method?: string;
    url?: string;
    usage?: string;
    [other: string]: unknown;
}

export interface RawConsoleHelp {
    functions: Record<string, RawConsoleFunction>;
    [other: string]: unknown;
}

/** HTTP binding of a function, taken from the Console format. WAMP-only functions have none. */
export interface HttpBinding {
    method: string;
    url: string;
    usage?: string;
}

export interface RawAppInfo {
    name?: string;
    version?: string;
    sdkVersion?: string;
    patchline?: string;
    [other: string]: unknown;
}

/** Everything the model builder needs; can be saved to disk and replayed offline. */
export interface HelpSnapshot {
    snapshotVersion: 1;
    appInfo: RawAppInfo;
    full: RawFullHelp;
    /** function name -> HTTP binding (functions without a URL are absent). */
    http: Record<string, HttpBinding>;
}

export function extractHttpBindings(consoleHelp: RawConsoleHelp): Record<string, HttpBinding> {
    const bindings: Record<string, HttpBinding> = {};
    for (const [name, fn] of Object.entries(consoleHelp.functions)) {
        if (!fn.url || !fn.http_method) continue;
        bindings[name] = {
            method: fn.http_method,
            url: fn.url,
            ...(fn.usage !== undefined ? {usage: fn.usage} : {}),
        };
    }
    return bindings;
}

export async function fetchSnapshot(client: RiotClient): Promise<HelpSnapshot> {
    const [appInfo, full, consoleHelp] = await Promise.all([
        client.get<RawAppInfo>("/riotclient/v1/app-info"),
        client.get<RawFullHelp>("/help", {format: "Full"}),
        client.get<RawConsoleHelp>("/help", {format: "Console"}),
    ]);
    return {snapshotVersion: 1, appInfo, full, http: extractHttpBindings(consoleHelp)};
}

export function loadSnapshot(file: string): HelpSnapshot {
    const data = JSON.parse(fs.readFileSync(file, "utf-8")) as Partial<HelpSnapshot>;
    if (data.snapshotVersion !== 1 || !data.full || !data.http) {
        throw new Error(`${file} is not a help snapshot (expected snapshotVersion 1 with "full" and "http")`);
    }
    return {appInfo: {}, ...data} as HelpSnapshot;
}

export function saveSnapshot(file: string, snapshot: HelpSnapshot): void {
    fs.mkdirSync(path.dirname(path.resolve(file)), {recursive: true});
    fs.writeFileSync(file, JSON.stringify(snapshot, null, 2) + "\n");
}
