/**
 * AsyncAPI 3.0.0 document for the Riot Client's WebSocket (WAMP 1.0) events.
 *
 * Each event becomes a channel whose address is the event name. The message
 * payload is the event object itself (the third element of the
 * `[8, name, payload]` frame); the WAMP framing is described in `info.description`.
 */
import {resourceDataTypes} from "../model/buildModel.js";
import type {ApiModel, EventDef, TypeDef, TypeRef} from "../model/model.js";
import {jsonSchemaDialect, reachableTypes, type Schema, typeDefToSchema, typeRefToSchema} from "./jsonSchema.js";
import type {Emitter} from "./types.js";

const SCHEMA_PREFIX = "#/components/schemas/";
const dialect = jsonSchemaDialect(SCHEMA_PREFIX);

const WAMP = {welcome: 0, subscribe: 5, unsubscribe: 6, event: 8} as const;
const CONTROL_CHANNEL = "wamp";

const DESCRIPTION = `WebSocket events of the local Riot Client.

**Connecting.** Open \`wss://127.0.0.1:{port}\` with the WebSocket subprotocol \`wamp\` and basic auth
(\`riot\` / the password from the lockfile). The TLS certificate is self-signed.

**Framing (WAMP 1.0, "WAMP-1.0-RiotRemoting").** Every frame is a JSON array:

| Frame | Direction | Meaning |
|---|---|---|
| \`[${WAMP.welcome}, sessionId, 1, "WAMP-1.0-RiotRemoting"]\` | server → client | welcome, sent on connect |
| \`[${WAMP.subscribe}, "<EventName>"]\` | client → server | subscribe to an event |
| \`[${WAMP.unsubscribe}, "<EventName>"]\` | client → server | unsubscribe |
| \`[${WAMP.event}, "<EventName>", payload]\` | server → client | event |

Each channel below is one event; its address is the event name and its message
describes \`payload\`, the third element of the \`[${WAMP.event}, ...]\` frame.
\`OnJsonApiEvent_a_b_c\` events report changes to the REST resources below \`/a/b/c\`;
\`OnJsonApiEvent\` reports changes to all of them.`;

function resourceListDescription(event: EventDef): string {
    if (event.resources.length === 0) return "";
    const lines = event.resources.map((op) => `- \`${op.method} ${op.path}\` (${op.name})`);
    return `Reports changes to these resources; \`uri\` is the resource path and \`data\` its new value:\n\n${lines.join("\n")}`;
}

/**
 * The event's payload schema. For resource events (`{uri, eventType, data}`) whose
 * resources are typed, `data` is narrowed to the resources' GET return types.
 */
function payloadSchema(event: EventDef, typesByName: Map<string, TypeDef>): Schema {
    const base = typeRefToSchema(event.payload, dialect);
    if (event.payload.kind !== "ref") return base;
    const def = typesByName.get(event.payload.name);
    if (def?.kind !== "object" || !def.fields.some((f) => f.name === "data" && f.type.kind === "any")) return base;
    const dataTypes = resourceDataTypes(event);
    if (dataTypes.length === 0) return base;

    const schema = typeDefToSchema(def, dialect) as Schema & { properties: Record<string, Schema> };
    // Resources may overlap (no required fields), so anyOf rather than oneOf.
    schema.properties.data = {
        description: "The resource's new value, as returned by its GET endpoint; may be null (e.g. for Delete).",
        anyOf: [...dataTypes.map((t) => typeRefToSchema(t, dialect)), {type: "null"}],
    };
    return schema;
}

function controlMessage(name: string, code: number, verb: string, eventNames: string[]): Schema {
    return {
        name,
        title: `${name} frame`,
        summary: `${verb} an event: \`[${code}, "<EventName>"]\`.`,
        contentType: "application/json",
        payload: {
            type: "array",
            items: [
                {type: "integer", const: code, description: "WAMP message type"},
                {type: "string", enum: eventNames, description: "Event name"},
            ],
            minItems: 2,
            maxItems: 2,
            additionalItems: false,
        },
    };
}

export function emitAsyncApi(model: ApiModel): object {
    const typesByName = new Map(model.types.map((t) => [t.name, t]));
    const eventNames = model.events.map((e) => e.name);

    const roots: TypeRef[] = model.events.flatMap((e) => [e.payload, ...resourceDataTypes(e)]);
    const schemas: Record<string, Schema> = {};
    for (const def of reachableTypes(model.types, roots)) schemas[def.name] = typeDefToSchema(def, dialect);

    const channels: Record<string, Schema> = {};
    const operations: Record<string, Schema> = {};
    const messages: Record<string, Schema> = {};

    for (const event of model.events) {
        const summary = event.description ? {summary: event.description} : {};
        const resources = resourceListDescription(event);
        messages[event.name] = {
            name: event.name,
            title: event.name,
            ...summary,
            ...(resources ? {description: resources} : {}),
            contentType: "application/json",
            payload: payloadSchema(event, typesByName),
        };
        channels[event.name] = {
            address: event.name,
            title: event.name,
            ...(event.description ? {description: event.description} : {}),
            messages: {[event.name]: {$ref: `#/components/messages/${event.name}`}},
        };
        operations[`receive${event.name}`] = {
            action: "receive",
            channel: {$ref: `#/channels/${event.name}`},
            ...summary,
            messages: [{$ref: `#/channels/${event.name}/messages/${event.name}`}],
        };
    }

    messages.Subscribe = controlMessage("Subscribe", WAMP.subscribe, "Subscribe to", eventNames);
    messages.Unsubscribe = controlMessage("Unsubscribe", WAMP.unsubscribe, "Unsubscribe from", eventNames);
    channels[CONTROL_CHANNEL] = {
        address: null,
        title: "WAMP control frames",
        description: "Frames the client sends on the socket to manage its subscriptions.",
        messages: {
            Subscribe: {$ref: "#/components/messages/Subscribe"},
            Unsubscribe: {$ref: "#/components/messages/Unsubscribe"},
        },
    };
    operations.subscribe = {
        action: "send",
        channel: {$ref: `#/channels/${CONTROL_CHANNEL}`},
        summary: "Subscribe to an event.",
        messages: [{$ref: `#/channels/${CONTROL_CHANNEL}/messages/Subscribe`}],
    };
    operations.unsubscribe = {
        action: "send",
        channel: {$ref: `#/channels/${CONTROL_CHANNEL}`},
        summary: "Unsubscribe from an event.",
        messages: [{$ref: `#/channels/${CONTROL_CHANNEL}/messages/Unsubscribe`}],
    };

    return {
        asyncapi: "3.0.0",
        info: {
            title: `${model.info.name} WebSocket API`,
            version: model.info.version,
            description: `${DESCRIPTION}\n\nCreated with SDK - Version ${model.info.sdkVersion}`,
        },
        defaultContentType: "application/json",
        servers: {
            riotClient: {
                host: "127.0.0.1:{port}",
                protocol: "wss",
                title: "Riot Client",
                description: "Local Riot Client WebSocket; use the subprotocol `wamp`. The TLS certificate is self-signed.",
                variables: {port: {default: "0", description: "Local port of the Riot Client"}},
                security: [{$ref: "#/components/securitySchemes/basicAuth"}],
            },
        },
        channels,
        operations,
        components: {
            schemas,
            messages,
            securitySchemes: {
                basicAuth: {
                    type: "http",
                    scheme: "basic",
                    description: "Basic authentication using the Riot Client credentials, username is 'riot' and password is the generated secret.",
                },
            },
        },
    };
}

export const asyncApiEmitter: Emitter = {
    id: "asyncapi",
    defaultFileName: "riot-client-asyncapi.json",
    description: "AsyncAPI 3.0.0 description of the WebSocket events",
    emit: emitAsyncApi,
};
