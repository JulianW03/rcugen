/** OpenAPI 3.0.3 document for the Riot Client's local REST API. */
import type {ApiModel, Operation, Parameter} from "../model/model.js";
import {log} from "../util/log.js";
import {openApi30Dialect, type Schema, typeDefToSchema, typeRefToSchema} from "./jsonSchema.js";
import type {Emitter} from "./types.js";

const SCHEMA_PREFIX = "#/components/schemas/";
const ANY_VALUE = "AnyValue";
const dialect = openApi30Dialect(SCHEMA_PREFIX, ANY_VALUE);

function parameterObject(param: Parameter): Schema {
    let description = param.description;
    if (param.greedy) {
        const note = `Greedy path parameter (\`{+${param.name}}\` in the client's URL template): the value may contain \`/\`.`;
        description = description ? `${description}\n\n${note}` : note;
    }
    return {
        name: param.name,
        in: param.in,
        required: param.required,
        ...(description ? {description} : {}),
        schema: typeRefToSchema(param.type, dialect),
    };
}

function operationObject(op: Operation): Schema {
    const responses: Record<string, unknown> = op.returns
        ? {
            "200": {
                description: "Successful response",
                content: {"application/json": {schema: typeRefToSchema(op.returns, dialect)}},
            },
        }
        : {"204": {description: "No content"}};
    responses["401"] = {$ref: "#/components/responses/UnauthorizedError"};

    return {
        operationId: op.name,
        tags: op.tags,
        ...(op.summary ? {summary: op.summary} : {}),
        ...(op.description ? {description: op.description} : {}),
        ...(op.deprecated ? {deprecated: true} : {}),
        ...(op.params.length > 0 ? {parameters: op.params.map(parameterObject)} : {}),
        ...(op.body ? {
            requestBody: {
                ...(op.body.description ? {description: op.body.description} : {}),
                required: op.body.required,
                content: {"application/json": {schema: typeRefToSchema(op.body.type, dialect)}},
            },
        } : {}),
        responses,
    };
}

export function emitOpenApi(model: ApiModel): object {
    const paths: Record<string, Record<string, Schema>> = {};
    for (const op of model.operations) {
        (paths[op.path] ??= {})[op.method.toLowerCase()] = operationObject(op);
    }

    const schemas: Record<string, Schema> = {};
    for (const def of model.types) schemas[def.name] = typeDefToSchema(def, dialect);
    if (ANY_VALUE in schemas) log.warn(`The help defines a type named ${ANY_VALUE}; it is replaced by the built-in one`);
    schemas[ANY_VALUE] = {nullable: true, "x-java-type": "java.lang.Object"};

    return {
        openapi: "3.0.3",
        info: {
            title: `${model.info.name} API`,
            version: model.info.version,
            description: `Created with SDK - Version ${model.info.sdkVersion}`,
        },
        servers: [{
            url: "https://127.0.0.1:{port}",
            description: "Riot Client API",
            variables: {port: {default: "0", description: "Local port of the Riot Client"}},
        }],
        paths,
        components: {
            securitySchemes: {
                basicAuth: {
                    type: "http",
                    scheme: "basic",
                    description: "Basic authentication using the Riot Client credentials, username is 'riot' and password is the generated secret.",
                },
            },
            responses: {
                UnauthorizedError: {description: "Missing authentication credentials"},
            },
            schemas,
        },
        security: [{basicAuth: []}],
    };
}

export const openApiEmitter: Emitter = {
    id: "openapi",
    defaultFileName: "riot-client-openapi.json",
    description: "OpenAPI 3.0.3 description of the REST API",
    emit: emitOpenApi,
};
