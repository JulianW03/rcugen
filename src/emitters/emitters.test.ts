import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {buildModel} from "../model/buildModel.js";
import {collectRefs, fixtureOverrides, fixtureSnapshot, resolvePointer} from "../testing/fixtures.js";
import {emitAsyncApi} from "./asyncapi.js";
import {EMITTERS} from "./index.js";
import {emitOpenApi} from "./openapi.js";

const model = buildModel(fixtureSnapshot(), {nameOverrides: fixtureOverrides});

// Loose view of the generated documents for assertions.
type Doc = Record<string, any>;

function assertRefsResolve(doc: object) {
    const refs = collectRefs(doc);
    assert.ok(refs.length > 0);
    for (const ref of refs) assert.notEqual(resolvePointer(doc, ref), undefined, `unresolved ${ref}`);
}

describe("emitter registry", () => {
    it("has openapi and asyncapi", () => {
        assert.deepEqual(Object.keys(EMITTERS).sort(), ["asyncapi", "openapi"]);
    });
});

describe("OpenAPI emitter", () => {
    const doc = emitOpenApi(model) as Doc;
    const operations = Object.values(doc.paths as Record<string, Record<string, Doc>>).flatMap((p) => Object.values(p));

    it("emits OpenAPI 3.0.3 with resolvable refs", () => {
        assert.equal(doc.openapi, "3.0.3");
        assertRefsResolve(doc);
    });

    it("gives every operation an operationId", () => {
        assert.equal(operations.length, model.operations.length);
        for (const op of operations) assert.equal(typeof op.operationId, "string");
        assert.equal(new Set(operations.map((op) => op.operationId)).size, operations.length);
    });

    it("uses 200 with a schema or 204, plus 401", () => {
        const get = doc.paths["/things/v1/things/{id}"].get;
        assert.deepEqual(get.responses["200"].content["application/json"].schema, {$ref: "#/components/schemas/Thing"});
        assert.ok(get.responses["401"]);
        const put = doc.paths["/things/v1/things/{id}"].put;
        assert.deepEqual(Object.keys(put.responses), ["204", "401"]);
        assert.ok(operations.every((op) => !("2XX" in op.responses)));
    });

    it("emits integer types and no type null", () => {
        const thing = doc.components.schemas.Thing;
        assert.deepEqual(thing.properties.id, {type: "integer", format: "int64"});
        assert.deepEqual(doc.components.schemas.Child.properties.value, {type: "integer", format: "int32"});
        assert.equal(JSON.stringify(doc).includes('"type":"null"'), false);
    });

    it("marks optional non-ref fields nullable and leaves refs bare", () => {
        const thing = doc.components.schemas.Thing;
        assert.deepEqual(thing.properties.name, {type: "string", nullable: true});
        assert.deepEqual(thing.properties.child, {$ref: "#/components/schemas/Child"});
        assert.deepEqual(thing.properties.meta, {type: "object", additionalProperties: {$ref: "#/components/schemas/AnyValue"}});
        assert.deepEqual(doc.components.schemas.AnyValue, {nullable: true, "x-java-type": "java.lang.Object"});
    });

    it("places header and body parameters", () => {
        const del = doc.paths["/chat/v1/blocked"].delete;
        assert.deepEqual(del.parameters, [{name: "rchat-blocking", in: "header", required: false, schema: {type: "boolean"}}]);
        assert.deepEqual(del.requestBody.content["application/json"].schema, {$ref: "#/components/schemas/Child"});
        assert.equal(del.deprecated, true);
    });

    it("documents greedy path parameters", () => {
        const [param] = doc.paths["/files/v1/{path}"].get.parameters;
        assert.equal(param.in, "path");
        assert.match(param.description, /may contain `\/`/);
    });
});

describe("AsyncAPI emitter", () => {
    const doc = emitAsyncApi(model) as Doc;

    it("emits AsyncAPI 3.0.0 with resolvable refs", () => {
        assert.equal(doc.asyncapi, "3.0.0");
        assertRefsResolve(doc);
    });

    it("has a channel and receive operation per event, plus subscribe/unsubscribe", () => {
        for (const event of model.events) {
            assert.equal(doc.channels[event.name].address, event.name);
            assert.equal(doc.operations[`receive${event.name}`].action, "receive");
        }
        assert.equal(doc.operations.subscribe.action, "send");
        assert.equal(doc.operations.unsubscribe.action, "send");
        const frame = doc.components.messages.Subscribe.payload;
        assert.equal(frame.items[0].const, 5);
        assert.deepEqual(frame.items[1].enum, model.events.map((e) => e.name));
        assert.equal(doc.components.messages.Unsubscribe.payload.items[0].const, 6);
    });

    it("narrows data of resource events to the resources' return types", () => {
        const message = doc.components.messages.OnJsonApiEvent_things_v1_things;
        assert.deepEqual(message.payload.properties.data.anyOf, [
            {type: "array", items: {$ref: "#/components/schemas/Thing"}},
            {$ref: "#/components/schemas/Thing"},
            {type: "null"},
        ]);
        assert.match(message.description, /GET \/things\/v1\/things\/\{id\}/);
    });

    it("keeps the plain payload type when there is nothing to narrow", () => {
        assert.deepEqual(doc.components.messages.OnClientFlash.payload, {$ref: "#/components/schemas/PluginResourceEvent"});
        assert.deepEqual(doc.components.messages.OnJsonApiEvent.payload, {$ref: "#/components/schemas/PluginResourceEvent"});
        assert.deepEqual(doc.components.schemas.PluginResourceEvent.properties.data, {});
    });

    it("only includes schemas reachable from events", () => {
        const names = Object.keys(doc.components.schemas).sort();
        assert.deepEqual(names, [
            "Child", "Empty", "Mode", "PlayerAccountVngV1Profile", "PluginResourceEvent", "PluginResourceEventType", "Thing",
        ]);
        assert.deepEqual(doc.components.schemas.Thing.properties.name, {type: ["string", "null"]});
    });
});
