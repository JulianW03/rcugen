import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {after, describe, it} from "node:test";
import {parseLockfile, resolveCredentials} from "./client.js";

describe("credentials", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rcugen-"));
    after(() => fs.rmSync(dir, {recursive: true, force: true}));
    const lockfile = path.join(dir, "lockfile");
    fs.writeFileSync(lockfile, "Riot Client:1:5555:fromlock:https");
    const env = {PORT: "1234", SECRET: "fromenv"};

    it("parses the lockfile", () => {
        assert.deepEqual(parseLockfile("Riot Client:11672:63678:s3cr3t:https\n"), {port: 63678, password: "s3cr3t"});
        assert.throws(() => parseLockfile("garbage"));
    });

    it("prefers --port/--secret, then --lockfile, then PORT/SECRET", () => {
        assert.deepEqual(resolveCredentials({port: "42", secret: "x", lockfile}, env), {port: 42, password: "x"});
        assert.deepEqual(resolveCredentials({lockfile}, env), {port: 5555, password: "fromlock"});
        assert.deepEqual(resolveCredentials({}, env), {port: 1234, password: "fromenv"});
    });

    it("rejects incomplete or invalid flags", () => {
        assert.throws(() => resolveCredentials({port: "42"}, env), /together/);
        assert.throws(() => resolveCredentials({port: "nope", secret: "x"}, env), /Invalid port/);
        assert.throws(() => resolveCredentials({lockfile: path.join(dir, "missing")}, env), /not found/);
    });

    it("explains what is missing", () => {
        assert.throws(() => resolveCredentials({}, {}), /--port and --secret/);
    });
});
