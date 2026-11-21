/**
 * The single place that interprets the Full format's `{type, elementType}` pairs.
 *
 * | type        | elementType   | meaning                    |
 * |-------------|---------------|----------------------------|
 * | primitive   | ""            | that primitive             |
 * | Name        | ""            | reference to type `Name`   |
 * | "vector"    | X             | array of X                 |
 * | "map"       | X             | map of X                   |
 * | "map"       | ""            | map of any                 |
 * | "map"       | "map"         | map of (map of any)        |
 * | "object"    | ""            | any                        |
 * | ""          | ""            | any (void for return types; handled by the caller) |
 *
 * An element type is interpreted the same way, with "map"/"vector" meaning a
 * map/array of any (the nesting depth stops there in the Full format).
 */
import type {RawTypeRef} from "../source/help.js";
import {PRIMITIVE_NAMES, type PrimitiveName, type TypeRef} from "./model.js";

const PRIMITIVES: ReadonlySet<string> = new Set(PRIMITIVE_NAMES);

export const ANY: TypeRef = Object.freeze({kind: "any"}) as TypeRef;

export function isPrimitiveName(name: string): name is PrimitiveName {
    return PRIMITIVES.has(name);
}

/** Turns a named type into a TypeRef; lets the caller rename/validate references. */
export type RefResolver = (name: string) => TypeRef;

const plainRef: RefResolver = (name) => ({kind: "ref", name});

/** Interprets a bare type name (no element type). */
function nameToTypeRef(name: string, resolveRef: RefResolver): TypeRef {
    switch (name) {
        case "":
        case "object":
            return ANY;
        case "vector":
            return {kind: "array", items: ANY};
        case "map":
            return {kind: "map", values: ANY};
        default:
            return isPrimitiveName(name) ? {kind: "primitive", name} : resolveRef(name);
    }
}

export function toTypeRef(raw: RawTypeRef, resolveRef: RefResolver = plainRef): TypeRef {
    switch (raw.type) {
        case "vector":
            return {kind: "array", items: nameToTypeRef(raw.elementType, resolveRef)};
        case "map":
            return {kind: "map", values: nameToTypeRef(raw.elementType, resolveRef)};
        default:
            return nameToTypeRef(raw.type, resolveRef);
    }
}

/** True for `{type: ""}`, which on a function's `returns` means "returns nothing". */
export function isVoid(raw: RawTypeRef): boolean {
    return raw.type === "" && raw.elementType === "";
}

/** Calls `visit` for every named type referenced (transitively through arrays/maps) by `ref`. */
export function forEachRef(ref: TypeRef, visit: (name: string) => void): void {
    switch (ref.kind) {
        case "ref":
            visit(ref.name);
            break;
        case "array":
            forEachRef(ref.items, visit);
            break;
        case "map":
            forEachRef(ref.values, visit);
            break;
    }
}
