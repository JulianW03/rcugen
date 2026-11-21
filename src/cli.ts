#!/usr/bin/env node
/**
 * rcugen: Riot Client help -> API description documents.
 *
 *   rcugen [--format openapi,asyncapi] [--out ./out] [--input snapshot.json]
 *          [--save-snapshot out/help-snapshot.json] [--overrides file] [--verbose]
 *          [--port <port> --secret <password> | --lockfile <file>]
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {parseArgs} from "node:util";
import {EMITTERS, type Emitter} from "./emitters/index.js";
import {buildModel} from "./model/buildModel.js";
import {CREDENTIAL_ARGS, CREDENTIAL_USAGE, type CredentialOptions, resolveCredentials, RiotClient} from "./source/client.js";
import {fetchSnapshot, type HelpSnapshot, loadSnapshot, saveSnapshot} from "./source/help.js";
import {OVERRIDES_USAGE, resolveNameOverrides} from "./source/overrides.js";
import {log, setVerbose} from "./util/log.js";

const USAGE = `Usage: rcugen [options]

Generates API descriptions from a running Riot Client (or a saved snapshot).

  --format <list>         comma-separated formats (${Object.keys(EMITTERS).join(", ")}); default: all
  --out <dir>             output directory (default: ./out)
  --input <file>          read a saved help snapshot instead of the live client
  --save-snapshot <file>  write the help snapshot used for this run
${OVERRIDES_USAGE}
  --verbose               debug logging
  --help                  show this help

Connecting to the live client (first match wins):
${CREDENTIAL_USAGE}
  PORT + SECRET           environment variables
  (default)               the Riot Client lockfile in %LOCALAPPDATA% (Windows)

The secret is visible to other local processes when passed via --secret;
prefer --lockfile or environment variables on shared machines.`;

function selectEmitters(format: string | undefined): Emitter[] {
    if (!format) return Object.values(EMITTERS);
    return format.split(",").map((s) => s.trim()).filter(Boolean).map((id) => {
        const emitter = EMITTERS[id];
        if (!emitter) throw new Error(`Unknown format "${id}"; available: ${Object.keys(EMITTERS).join(", ")}`);
        return emitter;
    });
}

async function getSnapshot(input: string | undefined, credentials: CredentialOptions): Promise<HelpSnapshot> {
    if (input) {
        log.info(`Reading help snapshot ${input}`);
        return loadSnapshot(input);
    }
    const client = new RiotClient(resolveCredentials(credentials));
    log.info(`Fetching help from ${client.baseUrl}`);
    return fetchSnapshot(client);
}

async function main(): Promise<void> {
    const {values} = parseArgs({
        options: {
            format: {type: "string"},
            out: {type: "string", default: "./out"},
            input: {type: "string"},
            "save-snapshot": {type: "string"},
            overrides: {type: "string"},
            ...CREDENTIAL_ARGS,
            verbose: {type: "boolean", default: false},
            help: {type: "boolean", default: false},
        },
        strict: true,
    });
    if (values.help) {
        console.log(USAGE);
        return;
    }
    setVerbose(values.verbose);

    const emitters = selectEmitters(values.format);
    const nameOverrides = resolveNameOverrides(values.overrides);
    const snapshot = await getSnapshot(values.input, values);
    if (values["save-snapshot"]) {
        saveSnapshot(values["save-snapshot"], snapshot);
        log.info(`Saved help snapshot to ${values["save-snapshot"]}`);
    }

    const model = buildModel(snapshot, {nameOverrides});
    log.info(`${model.info.name} ${model.info.version}: ${model.types.length} types, `
        + `${model.operations.length} operations, ${model.events.length} events`);

    fs.mkdirSync(values.out, {recursive: true});
    for (const emitter of emitters) {
        const file = path.join(values.out, emitter.defaultFileName);
        fs.writeFileSync(file, JSON.stringify(emitter.emit(model), null, 2) + "\n");
        log.info(`Wrote ${emitter.id} to ${file}`);
    }
}

main().catch((err: unknown) => {
    log.error(err instanceof Error ? err.message : err);
    if (err instanceof Error) log.debug(err.stack);
    process.exitCode = 1;
});
