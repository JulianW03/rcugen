import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {fixtureOverrides, fixtureSnapshot} from "../testing/fixtures.js";
import {buildModel, matchEventResources, pathMatchesEventPrefix, resourcePrefixForEvent} from "./buildModel.js";
import type {Operation} from "./model.js";

describe("buildModel", () => {
    const model = buildModel(fixtureSnapshot(), {nameOverrides: fixtureOverrides});
    const op = (name: string) => {
        const found = model.operations.find((o) => o.name === name);
        assert.ok(found, `operation ${name}`);
        return found;
    };

    it("reads app info", () => {
        assert.deepEqual(model.info, {name: "Test Client", version: "1.2.3", sdkVersion: "9.9"});
    });

    it("applies name overrides to definitions and references, keeping the richer definition", () => {
        const profiles = model.types.filter((t) => t.name.toLowerCase() === "playeraccountvngv1profile");
        assert.equal(profiles.length, 1);
        assert.equal(profiles[0].name, "PlayerAccountVngV1Profile");
        assert.equal(profiles[0].kind === "object" && profiles[0].fields.length, 2);
        const thing = model.types.find((t) => t.name === "Thing");
        assert.ok(thing?.kind === "object");
        assert.deepEqual(thing.fields.find((f) => f.name === "profile")?.type, {kind: "ref", name: "PlayerAccountVngV1Profile"});
    });

    it("builds enums and empty objects", () => {
        assert.deepEqual(model.types.find((t) => t.name === "Mode"), {
            kind: "enum", name: "Mode", description: "",
            values: [{name: "Fast", value: 0, description: ""}, {name: "Slow", value: 1, description: ""}],
        });
        assert.deepEqual(model.types.find((t) => t.name === "Empty"), {kind: "object", name: "Empty", description: "", fields: []});
    });

    it("skips WAMP-only functions", () => {
        assert.equal(model.operations.some((o) => o.name === "Help"), false);
        assert.equal(model.operations.length, 8);
    });

    it("places header and body", () => {
        const del = op("DeleteChatV1Blocked");
        assert.deepEqual(del.params.map((p) => [p.name, p.in, p.required]), [["rchat-blocking", "header", false]]);
        assert.deepEqual(del.body, {name: "body", type: {kind: "ref", name: "Child"}, required: true, description: ""});
        assert.equal(del.returns, undefined);
        assert.equal(del.deprecated, true);
        assert.deepEqual(del.tags, ["Plugin chat"]);
    });

    it("keeps several primitives of a POST in the query", () => {
        assert.deepEqual(op("PostThingsV1Locale").params.map((p) => p.in), ["query", "query"]);
        assert.equal(op("PostThingsV1Locale").body, undefined);
    });

    it("normalises greedy path variables", () => {
        const get = op("GetFilesV1ByPath");
        assert.equal(get.path, "/files/v1/{path}");
        assert.deepEqual(get.params, [{
            name: "path", in: "path", type: {kind: "primitive", name: "string"}, required: true, description: "", greedy: true,
        }]);
        assert.deepEqual(get.returns, {kind: "map", values: {kind: "map", values: {kind: "any"}}});
    });

    it("keeps explicit tags and summary", () => {
        assert.deepEqual(op("PostThingsV1Flag").tags, ["Plugin things"]);
        assert.equal(op("PostThingsV1Flag").summary, "PostThingsV1Flag summary");
        assert.equal(op("PostThingsV1Flag").body?.name, "enabled");
    });

    it("links resource events to subscribable GETs", () => {
        const names = (event: string) => model.events.find((e) => e.name === event)?.resources.map((o) => o.name);
        assert.deepEqual(names("OnJsonApiEvent_things_v1_things"), ["GetThingsV1Things", "GetThingsV1ThingsById"]);
        assert.deepEqual(names("OnJsonApiEvent_other_v1"), ["GetOtherV1Empty"]);
        assert.deepEqual(names("OnJsonApiEvent"), []);
        assert.deepEqual(names("OnClientFlash"), []);
    });
});

describe("event resource prefixes", () => {
    it("derives the prefix from the event name", () => {
        assert.equal(resourcePrefixForEvent("OnJsonApiEvent_a-b_v1_c"), "_a-b_v1_c");
        assert.equal(resourcePrefixForEvent("OnJsonApiEvent"), undefined);
        assert.equal(resourcePrefixForEvent("OnLcdsEvent"), undefined);
    });

    it("matches on segment boundaries, allowing literal underscores", () => {
        assert.equal(pathMatchesEventPrefix("/a/v1/state", "_a_v1_state"), true);
        assert.equal(pathMatchesEventPrefix("/a/v1/state/{id}", "_a_v1_state"), true);
        assert.equal(pathMatchesEventPrefix("/a/v1/states", "_a_v1_state"), false);
        assert.equal(pathMatchesEventPrefix("/a/v1", "_a_v1_state"), false);
        assert.equal(pathMatchesEventPrefix("/p/v1/launching_from_xbgp", "_p_v1_launching_from_xbgp"), true);
        assert.equal(pathMatchesEventPrefix("/p/v1/launching/from_xbgp", "_p_v1_launching_from_xbgp"), true);
        assert.equal(pathMatchesEventPrefix("/p/v1/launching_from", "_p_v1_launching/from"), false);
    });

    it("filters the given operations", () => {
        const ops = ["/x/v1/a", "/x/v1/a/{id}", "/x/v1/ab", "/y/v1/a"].map((path) => ({path}) as Operation);
        assert.deepEqual(matchEventResources("OnJsonApiEvent_x_v1_a", ops).map((o) => o.path), ["/x/v1/a", "/x/v1/a/{id}"]);
    });
});
