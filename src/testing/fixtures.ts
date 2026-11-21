/** Small hand-written help snapshot for unit tests. */
import type {
    HelpSnapshot, RawArgument, RawEvent, RawField, RawFunction, RawType, RawTypeRef,
} from "../source/help.js";

export const t = (type: string, elementType = ""): RawTypeRef => ({type, elementType});

const field = (name: string, type: RawTypeRef, optional = false): RawField =>
    ({name, type, optional, description: "", offset: 0});

const object = (name: string, fields: RawField[]): RawType =>
    ({name, description: "", nameSpace: "", size: 0, tags: [], fields, values: []});

const enumType = (name: string, values: string[]): RawType => ({
    name, description: "", nameSpace: "", size: 0, tags: [], fields: [],
    values: values.map((v, i) => ({name: v, value: i, description: ""})),
});

const arg = (name: string, type: RawTypeRef, optional = false): RawArgument =>
    ({name, type, optional, description: ""});

const fn = (name: string, args: RawArgument[], returns: RawTypeRef, extra: Partial<RawFunction> = {}): RawFunction => ({
    name, arguments: args, returns,
    description: `${name} summary`, help: "", deprecated: false, deprecatedHelp: "", internal: false,
    nameSpace: "", subscribable: false, tags: ["$remoting-binding-module"], threadSafe: false,
    ...extra,
});

const event = (name: string, type: string): RawEvent =>
    ({name, description: "", nameSpace: "", tags: [], type: t(type)});

export function fixtureSnapshot(): HelpSnapshot {
    return {
        snapshotVersion: 1,
        appInfo: {name: "Test Client", version: "1.2.3", sdkVersion: "9.9"},
        full: {
            types: [
                object("Thing", [
                    field("id", t("uint64")),
                    field("name", t("string"), true),
                    field("tags", t("vector", "string")),
                    field("child", t("Child"), true),
                    field("meta", t("map")),
                    field("raw", t("object")),
                    field("mode", t("Mode")),
                    field("profile", t("PlayerAccountvngV1Profile")),
                ]),
                object("Child", [field("value", t("int32"))]),
                enumType("Mode", ["Fast", "Slow"]),
                object("PlayerAccountVngV1Profile", [field("a", t("string"))]),
                object("PlayerAccountvngV1Profile", [field("a", t("string")), field("b", t("string"))]),
                object("Empty", []),
                object("PluginResourceEvent", [
                    field("uri", t("string")),
                    field("eventType", t("PluginResourceEventType")),
                    field("data", t("object")),
                ]),
                enumType("PluginResourceEventType", ["Create", "Update", "Delete"]),
            ],
            functions: [
                fn("GetThingsV1Things", [arg("mode", t("Mode"), true)], t("vector", "Thing"), {subscribable: true}),
                fn("GetThingsV1ThingsById", [arg("id", t("uint64"))], t("Thing"), {subscribable: true}),
                fn("PutThingsV1ThingsById", [arg("id", t("uint64")), arg("body", t("Thing"))], t("")),
                fn("DeleteChatV1Blocked", [arg("rchat-blocking", t("bool"), true), arg("body", t("Child"))], t(""),
                    {help: "Deprecated, use v2"}),
                fn("PostThingsV1Locale", [arg("region", t("string")), arg("locale", t("string"))], t("")),
                fn("PostThingsV1Flag", [arg("enabled", t("bool"))], t("bool"), {tags: ["Plugin things"]}),
                fn("GetFilesV1ByPath", [arg("path", t("string"))], t("map", "map")),
                fn("GetOtherV1Empty", [], t("Empty"), {subscribable: true}),
                fn("Help", [], t("object"), {tags: ["$builtin"]}),
            ],
            events: [
                event("OnJsonApiEvent", "PluginResourceEvent"),
                event("OnJsonApiEvent_things_v1_things", "PluginResourceEvent"),
                event("OnJsonApiEvent_other_v1", "PluginResourceEvent"),
                event("OnClientFlash", "PluginResourceEvent"),
            ],
        },
        http: {
            GetThingsV1Things: {method: "GET", url: "/things/v1/things"},
            GetThingsV1ThingsById: {method: "GET", url: "/things/v1/things/{id}"},
            PutThingsV1ThingsById: {method: "PUT", url: "/things/v1/things/{id}"},
            DeleteChatV1Blocked: {method: "DELETE", url: "/chat/v1/blocked"},
            PostThingsV1Locale: {method: "POST", url: "/things/v1/locale"},
            PostThingsV1Flag: {method: "POST", url: "/things/v1/flag"},
            GetFilesV1ByPath: {method: "GET", url: "/files/v1/{+path}"},
            GetOtherV1Empty: {method: "GET", url: "/other/v1/empty"},
        },
    };
}

export const fixtureOverrides = {PlayerAccountvngV1Profile: "PlayerAccountVngV1Profile"};

/** Every `$ref` in `doc` (local refs only). */
export function collectRefs(doc: unknown): string[] {
    const refs: string[] = [];
    const walk = (node: unknown) => {
        if (Array.isArray(node)) node.forEach(walk);
        else if (node && typeof node === "object") {
            const ref = (node as { $ref?: unknown }).$ref;
            if (typeof ref === "string") refs.push(ref);
            Object.values(node).forEach(walk);
        }
    };
    walk(doc);
    return refs;
}

/** Resolves a local JSON pointer like `#/components/schemas/X`. */
export function resolvePointer(doc: unknown, ref: string): unknown {
    if (!ref.startsWith("#/")) return undefined;
    return ref.slice(2).split("/")
        .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"))
        .reduce<unknown>((node, key) => (node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined), doc);
}
