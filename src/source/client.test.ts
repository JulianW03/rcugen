import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {parseLockfile, resolveCredentials} from "./client.js";

describe("credentials", () => {
    it("parses the lockfile", () => {
        assert.deepEqual(parseLockfile("Riot Client:11672:63678:s3cr3t:https\n"), {port: 63678, password: "s3cr3t"});
        assert.throws(() => parseLockfile("garbage"));
    });

    it("prefers PORT and SECRET", () => {
        assert.deepEqual(resolveCredentials({PORT: "1234", SECRET: "x"}), {port: 1234, password: "x"});
    });

    it("explains what is missing", () => {
        assert.throws(() => resolveCredentials({}), /PORT and SECRET/);
    });
});
