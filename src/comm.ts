
import { fatalError, sleep } from "./utils";
import { Config } from "./config";

let authToken = '';
let initialized = false;
const delayedTasks: Map<number, [
    (value: RawResponse | PromiseLike<RawResponse>) => void,
    (reason?: any) => void
]> = new Map();

export type CommandNames =
    | 'post.session.begin'
    | 'post.session.end'
    | 'post.ping'
    | 'get.workspace'
    | 'get.read'
    | 'get.config.read'
    | 'post.config.write';

export class RequestError extends Error {
}

type RawResponse = {
    status: 'OK',
} | {
    status: 'ERROR',
    message: string,
} | {
    status: 'DELAYED',
    task: number,
};

type DelayedResponse = {
    status: 'OK',
    task: number,
} | {
    status: 'ERROR',
    message: string,
    task: number,
} | {
    status: 'DELAYED',
    task: number,
};

export interface SessionEndRequest {
    id: number;
}

export interface SessionBeginResponse {
    id: number;
}

export interface ConfigWriteRequest {
    config: Config;
}

export interface ConfigReadResponse {
    config: Config;
}

export interface PingRequest {
    tasks: number[];
}

export interface PingResponse {
    responses: any[];
}

export interface WorkspaceResponse {
    samples: any[];
    boards: any[];
    root: string;
}

export interface ReadRequest {
    file: string;
}

export type ReadResponse = {
    type: 'missing' | 'unknown',
    content: null,
} | {
    type: 'text' | 'binary',
    content: string,
} | {
    type: 'directory',
    content: string[],
}

export async function request(command: 'post.session.begin'): Promise<SessionBeginResponse>;
export async function request(command: 'post.session.end', args: SessionEndRequest): Promise<void>;
export async function request(command: 'post.ping', args: PingRequest): Promise<PingResponse>;
export async function request(command: 'get.workspace'): Promise<WorkspaceResponse>;
export async function request(command: 'post.config.write', args: ConfigWriteRequest): Promise<void>;
export async function request(command: 'get.config.read'): Promise<ConfigReadResponse>;
export async function request(command: 'get.read', args: ReadRequest): Promise<ReadResponse>;
export async function request(command: CommandNames, args?: { [key: string]: any }): Promise<any> {

    if (!initialized) {
        initialized = true;
        await initialize();
    }

    try {
        let response: Response;
        if (command.startsWith('post')) {
            let url = `/_api/${command.substring(5)}?${JSON.stringify({ _auth_: authToken })}`;
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(args ?? {})
            });
        } else {
            let url = `/_api/${command.substring(4)}?${JSON.stringify({ ...args, _auth_: authToken })}`;
            response = await fetch(url);
        }

        if (!response.ok) {
            try {
                let text = await response.text();
                console.error('Network error details:\n' + text);
            } catch (err) { }
            throw new RequestError(`Network response error: ${response.status} ${response.statusText}`);
        }

        let raw = await response.json() as RawResponse;

        while (raw.status !== 'OK') {
            if (raw.status === 'ERROR') {
                throw new RequestError(raw.message);
            } else if (raw.status === 'DELAYED') {
                raw = await new Promise<RawResponse>((resolve, reject) => {
                    delayedTasks.set((raw as any).task, [resolve, reject]);
                });
            }
        }

        return raw;

    } catch (error) {
        if (!(error instanceof RequestError)) {
            throw new RequestError(`Network response error: ${error}`);
        }
    }
}

async function doPolling() {
    while (true) {
        try {
            await sleep(300);
            if (delayedTasks.size === 0) {
                continue;
            }
            let all = await request('post.ping', { tasks: [...delayedTasks.keys()] })
            for (let res of all.responses as DelayedResponse[]) {
                if (res.status === 'DELAYED') {
                    continue;
                } else {
                    let cbk = delayedTasks.get(res.task);
                    if (!cbk) {
                        console.error(`No callback found for task ${res.task}`);
                        continue;
                    }
                    delayedTasks.delete(res.task);
                    if (res.status === 'OK') {
                        cbk[0](res);
                    } else if (res.status === 'ERROR') {
                        cbk[1](new RequestError(res.message));
                    }
                }
            }
        } catch (e) {
            console.error(e);
            await sleep(2000);
        }
    }
}

async function initialize() {
    const hash = window.location.hash;
    if (hash.startsWith('#_auth_')) {
        authToken = hash.substring(7);
    } else {
        fatalError("Invalid authorization token.");
    }
    let id = (await request('post.session.begin')).id;
    let url = `/_api/session.end?${JSON.stringify({ _auth_: authToken })}`;
    let req: SessionEndRequest = { id };
    let body = new TextEncoder().encode(JSON.stringify(req));
    window.onbeforeunload = () => {
        navigator.sendBeacon(url, body);
    }
    doPolling();
}

