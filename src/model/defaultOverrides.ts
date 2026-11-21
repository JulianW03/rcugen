/**
 * Type renames applied on every run. `--overrides <file>` entries take precedence
 * per name; mapping a name to itself cancels a default.
 *
 * The help defines `PlayerAccountvngV1*` (camelCase fields, unused by any endpoint)
 * next to `PlayerAccountVngV1*` (snake_case, used by /player-account/vng/v1/...).
 * The names differ only in case, which breaks code generators on case-insensitive
 * file systems, so the unused variants get distinct names.
 */
export const DEFAULT_NAME_OVERRIDES: Readonly<Record<string, string>> = Object.freeze({
    PlayerAccountvngV1Profile: "PlayerAccountVngV1ProfileAlt",
    PlayerAccountvngV1StatusResponse: "PlayerAccountVngV1StatusResponseAlt",
});
