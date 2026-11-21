/**
 * Format-neutral API model. Built once from a help snapshot (`buildModel.ts`) and
 * consumed by every emitter. Contains no OpenAPI/AsyncAPI concepts.
 */

export const PRIMITIVE_NAMES = [
    "string", "bool",
    "int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64",
    "float", "double",
] as const;

export type PrimitiveName = typeof PRIMITIVE_NAMES[number];

export type TypeRef =
    | { kind: "primitive"; name: PrimitiveName }
    /** Reference to a named {@link TypeDef}; always resolves within the model. */
    | { kind: "ref"; name: string }
    | { kind: "array"; items: TypeRef }
    /** String-keyed map. */
    | { kind: "map"; values: TypeRef }
    /** Any JSON value. */
    | { kind: "any" };

export interface EnumValue {
    name: string;
    value: number;
    description: string;
}

export interface Field {
    name: string;
    type: TypeRef;
    optional: boolean;
    description: string;
}

interface TypeDefBase {
    name: string;
    description: string;
}

export interface EnumTypeDef extends TypeDefBase {
    kind: "enum";
    values: EnumValue[];
}

export interface ObjectTypeDef extends TypeDefBase {
    kind: "object";
    fields: Field[];
}

export type TypeDef = EnumTypeDef | ObjectTypeDef;

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ParamLocation = "path" | "query" | "header";

export interface Parameter {
    name: string;
    in: ParamLocation;
    type: TypeRef;
    required: boolean;
    description: string;
    /** Path parameter written as `{+name}` in the URL: its value may contain `/`. */
    greedy?: boolean;
}

export interface RequestBody {
    /** Argument name of the body in the help (usually `body`). */
    name: string;
    type: TypeRef;
    required: boolean;
    description: string;
}

export interface Operation {
    /** Function name from the help; unique, used as operationId. */
    name: string;
    method: HttpMethod;
    /** URL template with `{+x}` normalised to `{x}` (see {@link Parameter.greedy}). */
    path: string;
    params: Parameter[];
    body?: RequestBody;
    /** Absent when the function returns nothing. */
    returns?: TypeRef;
    tags: string[];
    deprecated: boolean;
    summary: string;
    description: string;
    /** The help flags this GET as a resource that emits `OnJsonApiEvent_*` updates. */
    subscribable: boolean;
}

export interface EventDef {
    name: string;
    description: string;
    /** The event object delivered as the third element of the WAMP `[8, name, payload]` frame. */
    payload: TypeRef;
    /** Subscribable GET operations whose resources this event reports changes for. */
    resources: Operation[];
}

export interface ApiInfo {
    /** e.g. "Riot Client" */
    name: string;
    version: string;
    sdkVersion: string;
}

export interface ApiModel {
    info: ApiInfo;
    types: TypeDef[];
    operations: Operation[];
    events: EventDef[];
}
