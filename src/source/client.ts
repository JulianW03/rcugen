import axios, {type AxiosInstance} from "axios";
import * as fs from "node:fs";
import * as https from "node:https";
import * as path from "node:path";

export interface ClientCredentials {
    port: number;
    password: string;
}

/** Default lockfile location of the Riot Client on Windows. */
export function defaultLockfilePath(env: NodeJS.ProcessEnv = process.env): string | undefined {
    const localAppData = env.LOCALAPPDATA;
    if (!localAppData) return undefined;
    return path.join(localAppData, "Riot Games", "Riot Client", "Config", "lockfile");
}

/** Lockfile format: `<name>:<pid>:<port>:<password>:<protocol>`. */
export function parseLockfile(content: string): ClientCredentials {
    const parts = content.trim().split(":");
    if (parts.length < 5) throw new Error(`Unexpected lockfile format: ${parts.length} fields`);
    const port = Number(parts[2]);
    const password = parts[3];
    if (!Number.isInteger(port) || port <= 0) throw new Error(`Invalid port in lockfile: ${parts[2]}`);
    return {port, password};
}

/** Credential sources given on the command line. */
export interface CredentialOptions {
    port?: string;
    secret?: string;
    lockfile?: string;
}

/** `parseArgs` option definitions matching {@link CredentialOptions}. */
export const CREDENTIAL_ARGS = {
    port: {type: "string"},
    secret: {type: "string"},
    lockfile: {type: "string"},
} as const;

export const CREDENTIAL_USAGE = `  --port <port>           Riot Client port      } both required; override PORT/SECRET
  --secret <password>     Riot Client password  } and the lockfile
  --lockfile <file>       read port and password from this lockfile`;

function parsePort(value: string, source: string): number {
    const port = Number(value);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error(`Invalid port from ${source}: ${value}`);
    return port;
}

function readLockfile(file: string): ClientCredentials {
    if (!fs.existsSync(file)) throw new Error(`Lockfile not found: ${file}`);
    return parseLockfile(fs.readFileSync(file, "utf-8"));
}

/**
 * First match wins:
 * 1. `--port` + `--secret`
 * 2. `--lockfile <file>`
 * 3. `PORT` + `SECRET` environment variables
 * 4. the default lockfile (`%LOCALAPPDATA%\Riot Games\Riot Client\Config\lockfile`, Windows only)
 */
export function resolveCredentials(options: CredentialOptions = {}, env: NodeJS.ProcessEnv = process.env): ClientCredentials {
    if (options.port !== undefined || options.secret !== undefined) {
        if (options.port === undefined || options.secret === undefined) {
            throw new Error("--port and --secret must be given together");
        }
        return {port: parsePort(options.port, "--port"), password: options.secret};
    }
    if (options.lockfile !== undefined) return readLockfile(options.lockfile);
    if (env.PORT && env.SECRET) return {port: parsePort(env.PORT, "PORT"), password: env.SECRET};

    const lockfile = defaultLockfilePath(env);
    if (lockfile && fs.existsSync(lockfile)) return readLockfile(lockfile);
    throw new Error(
        "No Riot Client credentials: pass --port and --secret, pass --lockfile <file>, set PORT and SECRET, "
        + "or start the Riot Client so its lockfile exists"
        + (lockfile ? ` (${lockfile})` : "") + ". Use --input <snapshot> to work offline."
    );
}

/** Thin HTTP client for the local Riot Client API (self-signed TLS, basic auth `riot:<password>`). */
export class RiotClient {
    readonly baseUrl: string;
    private readonly http: AxiosInstance;

    constructor(credentials: ClientCredentials) {
        this.baseUrl = `https://127.0.0.1:${credentials.port}`;
        this.http = axios.create({
            baseURL: this.baseUrl,
            httpsAgent: new https.Agent({rejectUnauthorized: false}),
            auth: {username: "riot", password: credentials.password},
            // help?format=Full is several MB
            maxContentLength: Infinity,
        });
    }

    async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
        const response = await this.http.get<T>(endpoint, {params});
        return response.data;
    }
}
