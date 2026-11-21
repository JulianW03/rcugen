import assert from "node:assert/strict";
import {describe, it} from "node:test";
import type {TypeRef} from "./model.js";
import {placeArguments, urlTemplateVariables} from "./paramLocation.js";

const str: TypeRef = {kind: "primitive", name: "string"};
const bool: TypeRef = {kind: "primitive", name: "bool"};
const obj: TypeRef = {kind: "ref", name: "Thing"};
const list: TypeRef = {kind: "array", items: str};

describe("placeArguments", () => {
    it("puts {name} and {+name} URL variables in the path", () => {
        assert.deepEqual(
            placeArguments("GET", "/p/{productId}/files/{+path}", [{name: "productId", type: str}, {name: "path", type: str}]),
            ["path", "path"],
        );
        assert.deepEqual(urlTemplateVariables("/a/{x}/{+rest}"), new Map([["x", {greedy: false}], ["rest", {greedy: true}]]));
    });

    it("puts known primitive header arguments in headers, case-insensitively", () => {
        assert.deepEqual(
            placeArguments("DELETE", "/chat/v3/blocked", [{name: "rchat-blocking", type: bool}, {name: "body", type: obj}]),
            ["header", "body"],
        );
        assert.deepEqual(placeArguments("GET", "/x", [{name: "JWT", type: str}]), ["header"]);
    });

    it("puts every other GET argument in the query, even non-primitives", () => {
        assert.deepEqual(
            placeArguments("GET", "/things", [{name: "mode", type: obj}, {name: "ids", type: list}, {name: "q", type: str}]),
            ["query", "query", "query"],
        );
    });

    it("uses a single remaining primitive as the body", () => {
        assert.deepEqual(placeArguments("POST", "/flag", [{name: "enabled", type: bool}]), ["body"]);
        assert.deepEqual(
            placeArguments("PUT", "/things/{id}", [{name: "id", type: str}, {name: "value", type: str}]),
            ["path", "body"],
        );
    });

    it("uses the last non-primitive as the body and the rest as query", () => {
        assert.deepEqual(
            placeArguments("POST", "/x", [
                {name: "a", type: obj}, {name: "flag", type: bool}, {name: "b", type: list}, {name: "c", type: str},
            ]),
            ["query", "query", "body", "query"],
        );
    });

    it("keeps several primitives in the query", () => {
        assert.deepEqual(
            placeArguments("POST", "/riotclient/set_region_locale", [{name: "region", type: str}, {name: "locale", type: str}]),
            ["query", "query"],
        );
    });

    it("does not place header names that are not primitive in headers", () => {
        assert.deepEqual(placeArguments("POST", "/x", [{name: "jwt", type: obj}]), ["body"]);
    });
});
