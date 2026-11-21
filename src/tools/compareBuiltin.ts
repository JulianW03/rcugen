/**
 * Verification only: compares our model against the client's own
 * `/swagger/v3/openapi.json` (matched by operationId) and reports where we place
 * arguments differently. Exits with code 1 on any placement mismatch.
 *
 *   npm run compare-builtin [-- --input snapshot.json --swagger builtin.json --verbose]
 *
 * Accepts the same --overrides and credential options as the CLI.
 */
import * as fs from "node:fs";
import {parseArgs} from "node:util";
import {buildModel} from "../model/buildModel.js";
import type {Operation} from "../model/model.js";
import {CREDENTIAL_ARGS, resolveCredentials, RiotClient} from "../source/client.js";
import {fetchSnapshot, loadSnapshot} from "../source/help.js";
import {resolveNameOverrides} from "../source/overrides.js";
import {log, setVerbose} from "../util/log.js";

interface BuiltinParameter {
    name: string;
    in: string;
}

interface BuiltinOperation {
    operationId?: string;
    parameters?: BuiltinParameter[];
    requestBody?: { "x-param-name"?: string };
    responses?: Record<string, unknown>;
}

interface BuiltinSpec {
    paths: Record<string, Record<string, BuiltinOperation>>;
}

/** Placeholder name for a body whose argument name the builtin spec does not state. */
const UNNAMED_BODY = "<body>";

function builtinPlacements(op: BuiltinOperation): Map<string, string> {
    const placements = new Map<string, string>();
    for (const p of op.parameters ?? []) placements.set(p.name, p.in);
    if (op.requestBody) placements.set(op.requestBody["x-param-name"] ?? UNNAMED_BODY, "body");
    return placements;
}

function ourPlacements(op: Operation, bodyNameKnown: boolean): Map<string, string> {
    const placements = new Map<string, string>();
    for (const p of op.params) placements.set(p.name, p.in);
    if (op.body) placements.set(bodyNameKnown ? op.body.name : UNNAMED_BODY, "body");
    return placements;
}

async function main(): Promise<void> {
    const {values} = parseArgs({
        options: {
            input: {type: "string"},
            swagger: {type: "string"},
            overrides: {type: "string"},
            ...CREDENTIAL_ARGS,
            verbose: {type: "boolean", default: false},
        },
    });
    setVerbose(values.verbose);

    const needsClient = !values.input || !values.swagger;
    const client = needsClient ? new RiotClient(resolveCredentials(values)) : undefined;
    const snapshot = values.input ? loadSnapshot(values.input) : await fetchSnapshot(client!);
    const builtin: BuiltinSpec = values.swagger
        ? JSON.parse(fs.readFileSync(values.swagger, "utf-8"))
        : await client!.get<BuiltinSpec>("/swagger/v3/openapi.json");
    const model = buildModel(snapshot, {nameOverrides: resolveNameOverrides(values.overrides)});
    const ours = new Map(model.operations.map((op) => [op.name, op]));

    let compared = 0;
    let argsCompared = 0;
    const onlyBuiltin: string[] = [];
    const bindingDiffs: string[] = [];
    const placementDiffs: string[] = [];
    const responseDiffs: string[] = [];

    for (const [path, methods] of Object.entries(builtin.paths)) {
        for (const [method, bop] of Object.entries(methods)) {
            const id = bop.operationId;
            if (!id) continue;
            const op = ours.get(id);
            if (!op) {
                onlyBuiltin.push(`${method.toUpperCase()} ${path} (${id})`);
                continue;
            }
            compared++;
            if (op.method !== method.toUpperCase() || op.path !== path) {
                bindingDiffs.push(`${id}: builtin ${method.toUpperCase()} ${path}, ours ${op.method} ${op.path}`);
            }

            const theirs = builtinPlacements(bop);
            const mine = ourPlacements(op, !theirs.has(UNNAMED_BODY));
            for (const name of new Set([...theirs.keys(), ...mine.keys()])) {
                argsCompared++;
                const a = theirs.get(name) ?? "absent";
                const b = mine.get(name) ?? "absent";
                if (a !== b) placementDiffs.push(`${id} ${op.method} ${op.path}: "${name}" builtin=${a} ours=${b}`);
            }

            const builtinReturns = Object.keys(bop.responses ?? {}).some((code) => code === "200");
            if (builtinReturns !== (op.returns !== undefined)) {
                responseDiffs.push(`${id}: builtin ${builtinReturns ? "200" : "no 200"}, ours ${op.returns ? "returns" : "void"}`);
            }
        }
    }

    const printList = (title: string, items: string[], limit = 50) => {
        log.info(`${title}: ${items.length}`);
        for (const item of items.slice(0, values.verbose ? items.length : limit)) log.info(`  ${item}`);
        if (!values.verbose && items.length > limit) log.info(`  ... ${items.length - limit} more (--verbose shows all)`);
    };

    log.info(`Operations: ours ${model.operations.length}, builtin covers ${compared} of them`);
    log.info(`Arguments compared: ${argsCompared}`);
    printList("Parameter placement mismatches", placementDiffs);
    printList("Method/path differences", bindingDiffs, 10);
    printList("Response differences (200 vs no content)", responseDiffs, 10);
    printList("Operations only in builtin spec", onlyBuiltin, 10);

    if (placementDiffs.length > 0) process.exitCode = 1;
}

main().catch((err: unknown) => {
    log.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
});
