
export function fatalError(message: string): never {
    // TODO: create error message on page
    throw new Error(message);
}

export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const emptyCache = Symbol('emptyCache');

export function cached<T>(func: T): T {
    let cachedArgs = [emptyCache];
    let cachedResult = undefined;
    return function(...args: any[]): any {
        if (cachedArgs.length != args.length) {
            cachedArgs = args;
            cachedResult = (func as any)(...args);
        } else {
            for (let i = 0; i < args.length; i++) {
                if (cachedArgs[i] !== args[i]) {
                    cachedArgs = args;
                    cachedResult = (func as any)(...args);
                    break;
                }
            }
        }
        return cachedResult;
    } as T;
}
