/**
 * Model types -> JSON Schema fragments, shared by all emitters. The differences
 * between OpenAPI 3.0 schemas and JSON Schema (draft-07, used by AsyncAPI) are
 * captured in a {@link SchemaDialect}.
 */
import type {Field, PrimitiveName, TypeDef, TypeRef} from "../model/model.js";
import {forEachRef} from "../model/typeRefs.js";

export type Schema = Record<string, unknown>;

export interface SchemaDialect {
    /** e.g. `#/components/schemas/` */
    refPrefix: string;
    /** Schema for "any JSON value". */
    any(): Schema;
    /** Marks a field schema as accepting null. Never called for `$ref` schemas. */
    nullable(schema: Schema): Schema;
}

/** OpenAPI 3.0: `nullable: true`; "any" is a shared `AnyValue` component. */
export function openApi30Dialect(refPrefix: string, anyValueName: string): SchemaDialect {
    return {
        refPrefix,
        any: () => ({$ref: refPrefix + escapePointer(anyValueName)}),
        nullable: (schema) => ({...schema, nullable: true}),
    };
}

/** JSON Schema draft-07: `type: [t, "null"]`; "any" is `{}`. */
export function jsonSchemaDialect(refPrefix: string): SchemaDialect {
    return {
        refPrefix,
        any: () => ({}),
        nullable: (schema) => typeof schema.type === "string" ? {...schema, type: [schema.type, "null"]} : schema,
    };
}

/** Escapes a name for use as a JSON pointer segment. */
export function escapePointer(name: string): string {
    return name.replace(/~/g, "~0").replace(/\//g, "~1");
}

export function primitiveSchema(name: PrimitiveName): Schema {
    switch (name) {
        case "string":
            return {type: "string"};
        case "bool":
            return {type: "boolean"};
        case "int8":
        case "uint8":
        case "int16":
        case "uint16":
        case "int32":
            return {type: "integer", format: "int32"};
        case "uint32":
        case "int64":
        case "uint64":
            return {type: "integer", format: "int64"};
        case "float":
            return {type: "number", format: "float"};
        case "double":
            return {type: "number", format: "double"};
    }
}

export function typeRefToSchema(ref: TypeRef, dialect: SchemaDialect): Schema {
    switch (ref.kind) {
        case "primitive":
            return primitiveSchema(ref.name);
        case "ref":
            return {$ref: dialect.refPrefix + escapePointer(ref.name)};
        case "array":
            return {type: "array", items: typeRefToSchema(ref.items, dialect)};
        case "map":
            return {type: "object", additionalProperties: typeRefToSchema(ref.values, dialect)};
        case "any":
            return dialect.any();
    }
}

export function fieldSchema(field: Field, dialect: SchemaDialect): Schema {
    let schema = typeRefToSchema(field.type, dialect);
    // `$ref` siblings are ignored in OpenAPI 3.0 / draft-07, so reference fields stay bare.
    if ("$ref" in schema) return schema;
    if (field.description) schema = {...schema, description: field.description};
    if (field.optional) schema = dialect.nullable(schema);
    return schema;
}

export function typeDefToSchema(def: TypeDef, dialect: SchemaDialect): Schema {
    const description = def.description ? {description: def.description} : {};
    if (def.kind === "enum") {
        return {type: "string", ...description, enum: def.values.map((v) => v.name)};
    }
    const properties: Record<string, Schema> = {};
    for (const field of def.fields) properties[field.name] = fieldSchema(field, dialect);
    return {type: "object", ...description, properties};
}

/** Type definitions reachable from `roots`, in model order. */
export function reachableTypes(types: readonly TypeDef[], roots: Iterable<TypeRef>): TypeDef[] {
    const byName = new Map(types.map((t) => [t.name, t]));
    const reached = new Set<string>();
    const queue: string[] = [];
    const visit = (name: string) => {
        if (reached.has(name) || !byName.has(name)) return;
        reached.add(name);
        queue.push(name);
    };
    for (const root of roots) forEachRef(root, visit);
    while (queue.length > 0) {
        const def = byName.get(queue.pop()!)!;
        if (def.kind === "object") for (const field of def.fields) forEachRef(field.type, visit);
    }
    return types.filter((t) => reached.has(t.name));
}
