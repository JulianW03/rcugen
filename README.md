# rcugen

Generate OpenAPI and AsyncAPI definitions from the Riot Client's Plugin Info.

The Riot Client describes its own local API at `/help`. rcugen reads that description from a running client and writes:

- `riot-client-openapi.json`: OpenAPI 3.0 for the local REST API
- `riot-client-asyncapi.json`: AsyncAPI 3.0 for the WebSocket events

## Disclaimer

rcugen isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties.

## Usage

Start the Riot Client, then run:

```sh
npx rcugen
```

Both files are written to `./out`. You need Node.js 20 or newer.

For the complete list of WebSocket events, generate after you've logged in at least once. Chat, social, voice chat and similar services only register their events after a login.

### Examples

```sh
npx rcugen --format openapi --out ./specs   # only OpenAPI, into ./specs
npx rcugen --save-snapshot snapshot.json    # also save the raw client data
npx rcugen --input snapshot.json            # regenerate offline from a snapshot
```

### Options

| Option | Description |
|---|---|
| `--format <list>` | `openapi`, `asyncapi` or both, comma-separated (default: both) |
| `--out <dir>` | Output directory (default: `./out`) |
| `--input <file>` | Use a saved snapshot instead of the live client |
| `--save-snapshot <file>` | Save the client data used for this run |
| `--overrides <file>` | Rename types, see below |
| `--verbose` | Debug logging |
| `--help` | Show all options |

### Connecting to the client

On Windows, rcugen finds the client by itself through its lockfile. Otherwise, use one of these (the first one given is used):

- `--port <port> --secret <password>`
- `--lockfile <file>`
- the environment variables `PORT` and `SECRET`

### Type name overrides

Some type names in the client's data differ only in case, which breaks code generators on case-insensitive file systems. rcugen renames the known cases itself. To rename more types, pass a JSON file:

```json
{ "OriginalName": "NewName" }
```

Your entries take precedence over the built-in renames. Map a name to itself to cancel a built-in rename.

## Development

```sh
npm install
npm test                  # build and run the unit tests
npm run generate          # generate from the running client
npm run compare-builtin   # compare argument placement with the client's own /swagger spec
```
