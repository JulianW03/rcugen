/**
 * Help snapshot -> {@link ApiModel}.
 *
 * Name overrides are applied here, to definitions and references alike, so
 * emitters only ever see final names.
 */
import type {HelpSnapshot, RawFunction, RawType} from "../source/help.js";
import {log} from "../util/log.js";
import type {
    ApiModel, EventDef, HttpMethod, Operation, Parameter, RequestBody, TypeDef, TypeRef,
} from "./model.js";
import {placeArguments, urlTemplateVariables} from "./paramLocation.js";
import {ANY, isVoid, type RefResolver, toTypeRef} from "./typeRefs.js";

export interface BuildOptions {
    /** original type name -> name to use instead */
    nameOverrides?: Record<string, string>;
}

const HTTP_METHODS: ReadonlySet<string> = new Set<HttpMethod>(["GET", "POST", "PUT", "PATCH", "DELETE"]);

/** Help tags that carry no grouping information. */
const IGNORED_TAGS: ReadonlySet<string> = new Set(["$remoting-binding-module", "Plugins"]);

export const JSON_API_EVENT = "OnJsonApiEvent";

export function buildModel(snapshot: HelpSnapshot, options: BuildOptions = {}): ApiModel {
    const overrides = options.nameOverrides ?? {};
    const rename = (name: string) => overrides[name] ?? name;

    const finalNames = new Set(snapshot.full.types.map((t) => rename(t.name)));
    const unresolved = new Set<string>();
    const resolveRef: RefResolver = (name) => {
        const finalName = rename(name);
        if (finalNames.has(finalName)) return {kind: "ref", name: finalName};
        if (!unresolved.has(name)) {
            unresolved.add(name);
            log.warn(`Unknown type "${name}" referenced; treating it as any`);
        }
        return ANY;
    };

    const types = buildTypes(snapshot.full.types, rename, resolveRef);
    const operations = buildOperations(snapshot, resolveRef);
    const subscribable = operations.filter((op) => op.method === "GET" && op.subscribable);
    const events: EventDef[] = snapshot.full.events.map((ev) => ({
        name: ev.name,
        description: ev.description.trim(),
        payload: toTypeRef(ev.type, resolveRef),
        resources: matchEventResources(ev.name, subscribable),
    }));

    const appInfo = snapshot.appInfo ?? {};
    return {
        info: {
            name: appInfo.name ?? "Unknown",
            version: appInfo.version ?? "0.0.1",
            sdkVersion: appInfo.sdkVersion ?? "Unknown",
        },
        types,
        operations,
        events,
    };
}

// ---------------------------------------------------------------- types

function convertType(raw: RawType, name: string, resolveRef: RefResolver): TypeDef {
    const description = raw.description.trim();
    if (raw.values.length > 0) {
        return {
            kind: "enum", name, description,
            values: raw.values.map((v) => ({name: v.name, value: v.value, description: v.description.trim()})),
        };
    }
    return {
        kind: "object", name, description,
        fields: raw.fields.map((f) => ({
            name: f.name,
            type: toTypeRef(f.type, resolveRef),
            optional: f.optional,
            description: f.description.trim(),
        })),
    };
}

const memberCount = (t: TypeDef) => t.kind === "enum" ? t.values.length : t.fields.length;

function buildTypes(rawTypes: RawType[], rename: (n: string) => string, resolveRef: RefResolver): TypeDef[] {
    const byName = new Map<string, TypeDef>();
    const sources = new Map<string, string[]>();
    for (const raw of rawTypes) {
        const name = rename(raw.name);
        const def = convertType(raw, name, resolveRef);
        const existing = byName.get(name);
        sources.set(name, [...(sources.get(name) ?? []), raw.name]);
        if (!existing) {
            byName.set(name, def);
            continue;
        }
        if (JSON.stringify(existing) === JSON.stringify(def)) {
            log.debug(`Types ${sources.get(name)!.join(", ")} are identical under the name "${name}"`);
            continue;
        }
        const keep = memberCount(def) > memberCount(existing) ? def : existing;
        byName.set(name, keep);
        log.warn(`Types ${sources.get(name)!.join(", ")} differ but share the name "${name}"; `
            + `keeping the one with ${memberCount(keep)} members`);
    }

    const byLowerName = new Map<string, string[]>();
    for (const name of byName.keys()) {
        const key = name.toLowerCase();
        byLowerName.set(key, [...(byLowerName.get(key) ?? []), name]);
    }
    for (const names of byLowerName.values()) {
        if (names.length > 1) {
            log.warn(`Type names differ only in case: ${names.join(", ")} `
                + "(clashes on case-insensitive file systems; rename one via --overrides)");
        }
    }

    return [...byName.values()];
}

// ---------------------------------------------------------------- operations

function firstPathSegment(url: string): string | undefined {
    return url.match(/[^/?#]+/)?.[0];
}

function operationTags(fn: RawFunction, url: string): string[] {
    const tags = fn.tags.filter((t) => !IGNORED_TAGS.has(t));
    if (tags.length > 0) return tags;
    return [`Plugin ${firstPathSegment(url) ?? "core-sdk"}`];
}

function isDeprecated(fn: RawFunction): boolean {
    return fn.deprecated
        || fn.deprecatedHelp.trim() !== ""
        || /deprecated/i.test(fn.description)
        || /deprecated/i.test(fn.help);
}

function operationDescription(fn: RawFunction): string {
    const parts = [fn.help.trim()];
    if (fn.deprecatedHelp.trim()) parts.push(`Deprecated: ${fn.deprecatedHelp.trim()}`);
    return parts.filter(Boolean).join("\n\n");
}

function buildOperations(snapshot: HelpSnapshot, resolveRef: RefResolver): Operation[] {
    const operations: Operation[] = [];
    const seen = new Map<string, string>();

    for (const fn of snapshot.full.functions) {
        const binding = snapshot.http[fn.name];
        if (!binding) {
            log.debug(`${fn.name}: no HTTP binding (WAMP-only), skipped`);
            continue;
        }
        const method = binding.method.toUpperCase();
        if (!HTTP_METHODS.has(method)) {
            log.warn(`${fn.name}: unsupported HTTP method "${binding.method}", skipped`);
            continue;
        }
        const httpMethod = method as HttpMethod;
        const urlVars = urlTemplateVariables(binding.url);
        const path = binding.url.replace(/\{\+([^}]+)\}/g, "{$1}");

        const key = `${httpMethod} ${path}`;
        if (seen.has(key)) {
            log.warn(`${fn.name}: ${key} is already bound to ${seen.get(key)}, skipped`);
            continue;
        }
        seen.set(key, fn.name);

        const args = fn.arguments.map((a) => ({
            name: a.name,
            type: toTypeRef(a.type, resolveRef),
            optional: a.optional,
            description: a.description.trim(),
        }));
        const locations = placeArguments(httpMethod, binding.url, args);

        const params: Parameter[] = [];
        let body: RequestBody | undefined;
        args.forEach((arg, i) => {
            const location = locations[i];
            if (location === "body") {
                body = {name: arg.name, type: arg.type, required: !arg.optional, description: arg.description};
                return;
            }
            const param: Parameter = {
                name: arg.name,
                in: location,
                type: arg.type,
                required: location === "path" || !arg.optional,
                description: arg.description,
            };
            if (location === "path" && urlVars.get(arg.name)?.greedy) param.greedy = true;
            params.push(param);
        });

        for (const [name, {greedy}] of urlVars) {
            if (args.some((a) => a.name === name)) continue;
            log.warn(`${fn.name}: URL variable {${name}} has no matching argument; assuming a string`);
            params.push({
                name, in: "path", type: {kind: "primitive", name: "string"}, required: true, description: "",
                ...(greedy ? {greedy} : {}),
            });
        }

        operations.push({
            name: fn.name,
            method: httpMethod,
            path,
            params,
            ...(body ? {body} : {}),
            ...(isVoid(fn.returns) ? {} : {returns: toTypeRef(fn.returns, resolveRef)}),
            tags: operationTags(fn, binding.url),
            deprecated: isDeprecated(fn),
            summary: fn.description.trim(),
            description: operationDescription(fn),
            subscribable: fn.subscribable,
        });
    }
    return operations;
}

// ---------------------------------------------------------------- events

/**
 * `OnJsonApiEvent_a_b_c` reports changes below `/a/b/c`. Returns `_a_b_c`, or
 * `undefined` for events that are not per-resource (including the catch-all `OnJsonApiEvent`).
 */
export function resourcePrefixForEvent(eventName: string): string | undefined {
    if (!eventName.startsWith(`${JSON_API_EVENT}_`)) return undefined;
    return eventName.slice(JSON_API_EVENT.length);
}

/**
 * True if `path` lies at or below the event prefix. The prefix spells `/` as `_`,
 * but `_` may also be part of a segment (`launching_from_xbgp`), so compare
 * character-wise and require the match to end on a segment boundary.
 */
export function pathMatchesEventPrefix(path: string, prefix: string): boolean {
    if (path.length < prefix.length) return false;
    for (let i = 0; i < prefix.length; i++) {
        if (path[i] === prefix[i]) continue;
        if (path[i] === "/" && prefix[i] === "_") continue;
        return false;
    }
    return path.length === prefix.length || path[prefix.length] === "/";
}

export function matchEventResources(eventName: string, operations: readonly Operation[]): Operation[] {
    const prefix = resourcePrefixForEvent(eventName);
    if (prefix === undefined) return [];
    return operations.filter((op) => pathMatchesEventPrefix(op.path, prefix));
}

/** Returns type of every resource, without duplicates; empty if any of them is untyped. */
export function resourceDataTypes(event: EventDef): TypeRef[] {
    const seen = new Map<string, TypeRef>();
    for (const op of event.resources) {
        if (!op.returns || op.returns.kind === "any") return [];
        seen.set(JSON.stringify(op.returns), op.returns);
    }
    return [...seen.values()];
}
