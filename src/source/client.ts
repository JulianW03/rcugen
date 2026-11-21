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

/**
 * Credentials come from `PORT` + `SECRET` if both are set, otherwise from the
 * Riot Client lockfile (`%LOCALAPPDATA%\Riot Games\Riot Client\Config\lockfile`).
 */
export function resolveCredentials(env: NodeJS.ProcessEnv = process.env): ClientCredentials {
    if (env.PORT && env.SECRET) {
        const port = Number(env.PORT);
        if (!Number.isInteger(port) || port <= 0) throw new Error(`Invalid PORT: ${env.PORT}`);
        return {port, password: env.SECRET};
    }
    const lockfile = defaultLockfilePath(env);
    if (lockfile && fs.existsSync(lockfile)) {
        return parseLockfile(fs.readFileSync(lockfile, "utf-8"));
    }
    throw new Error(
        "No Riot Client credentials: set PORT and SECRET (e.g. in .env) or start the Riot Client so its lockfile exists"
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
