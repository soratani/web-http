export abstract class Storage {
    abstract get(key: string, value?: any): any;
    abstract set(key: string, value: any): any;
}


export class DefaultStorage extends Storage {
    private cache: Record<string, any> = {};
    get(key: string, value?: any) {
        try {
            return this.cache[key];
        } catch (error) {
            return value;
        }
    }
    set(key: string, value: any) {
        // @ts-ignore
        this.cache[key] = value;
    }
    
}

export abstract class HttpLogger {
    constructor() {}
    abstract log(label: string, message: string): void;
    abstract info(label: string, ...message: any[]): void;
    abstract warn(label: string, ...message: any[]): void;
    abstract error(label: string, ...message: any[]): void;
}