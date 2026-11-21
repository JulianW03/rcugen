import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {t} from "../testing/fixtures.js";
import {isVoid, toTypeRef} from "./typeRefs.js";

describe("toTypeRef", () => {
    const cases: [string, ReturnType<typeof t>, unknown][] = [
        ["primitive", t("uint64"), {kind: "primitive", name: "uint64"}],
        ["named ref", t("Thing"), {kind: "ref", name: "Thing"}],
        ["vector|X", t("vector", "Thing"), {kind: "array", items: {kind: "ref", name: "Thing"}}],
        ["vector|string", t("vector", "string"), {kind: "array", items: {kind: "primitive", name: "string"}}],
        ["map|X", t("map", "Thing"), {kind: "map", values: {kind: "ref", name: "Thing"}}],
        ["map| (map of any)", t("map", ""), {kind: "map", values: {kind: "any"}}],
        ["map|object", t("map", "object"), {kind: "map", values: {kind: "any"}}],
        ["map|map (map of map of any)", t("map", "map"), {kind: "map", values: {kind: "map", values: {kind: "any"}}}],
        ["object (any)", t("object"), {kind: "any"}],
        ["\"\" (any)", t(""), {kind: "any"}],
    ];
    for (const [name, raw, expected] of cases) {
        it(name, () => assert.deepEqual(toTypeRef(raw), expected));
    }

    it("lets the caller resolve references", () => {
        const ref = toTypeRef(t("vector", "Old"), (name) => ({kind: "ref", name: name.toUpperCase()}));
        assert.deepEqual(ref, {kind: "array", items: {kind: "ref", name: "OLD"}});
    });

    it("treats only an empty type as void", () => {
        assert.equal(isVoid(t("")), true);
        assert.equal(isVoid(t("object")), false);
        assert.equal(isVoid(t("map", "")), false);
    });
});
