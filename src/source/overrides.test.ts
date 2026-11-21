import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {after, describe, it} from "node:test";
import {DEFAULT_NAME_OVERRIDES} from "../model/defaultOverrides.js";
import {loadNameOverrides, resolveNameOverrides} from "./overrides.js";

describe("name overrides", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rcugen-"));
    after(() => fs.rmSync(dir, {recursive: true, force: true}));
    const write = (name: string, content: string) => {
        const file = path.join(dir, name);
        fs.writeFileSync(file, content);
        return file;
    };
    const defaults = {A: "A2", B: "B2"};

    it("applies the built-in renames without a file", () => {
        assert.deepEqual(resolveNameOverrides(undefined), {...DEFAULT_NAME_OVERRIDES});
        assert.deepEqual(resolveNameOverrides(undefined, defaults), defaults);
    });

    it("lets file entries add to and replace built-in ones", () => {
        const file = write("user.json", '{"B": "Bx", "C": "C2"}');
        assert.deepEqual(resolveNameOverrides(file, defaults), {A: "A2", B: "Bx", C: "C2"});
    });

    it("cancels a built-in rename with an identity entry", () => {
        const file = write("identity.json", '{"A": "A"}');
        assert.equal(resolveNameOverrides(file, defaults).A, "A");
    });

    it("rejects missing files, invalid JSON and wrong shapes", () => {
        assert.throws(() => loadNameOverrides(path.join(dir, "missing.json")), /not found/);
        assert.throws(() => loadNameOverrides(write("bad.json", "{")), /not valid JSON/);
        assert.throws(() => loadNameOverrides(write("array.json", '["a"]')), /JSON object/);
        assert.throws(() => loadNameOverrides(write("number.json", '{"a": 1}')), /JSON object/);
    });
});
