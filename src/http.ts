import axios, { AxiosRequestConfig, AxiosRequestHeaders } from "axios";
import { get, isBoolean, isFunction, isNumber, omit, reduce } from "lodash";
import { Lock } from 'async-await-mutex-lock';
import { DefaultStorage, HttpLogger, Storage } from "./plugins";

function isScope(scopes: [number, number], value: number) {
    return value >= scopes[0] && value <= scopes[1];
}

function isInclude(scopes: number[], value: number) {
    return scopes.includes(value);
}

export enum Platform {
    base,
    desktop,
    app,
    web,
    h5,
    cli,
}

export type HttpClientRefrech = {
    key: string;
    path: string;
}

export type HttpClientHeaders = {
    platform?: Platform;
    prefix?: string;
    app?: string;
    version?: string;
    sign?: string;
    device?: () => Promise<string>;
}

export type HttpClientTokenOptions = {
    accessKey?: string;
    refreshKey?: string;
    refreshPath?: string;
}

export type HttpClientOptions = {
    storage?: Storage;
    logger?: HttpLogger;
    retry?: number;
    token?: HttpClientTokenOptions;
    headers: HttpClientHeaders;
}

export type HttpData<D = any> = {
    status: number;
    code: number;
    message: string;
    data?: D;
}

export type HttpConfig<D = any> = AxiosRequestConfig<D> & {
    retry?: number;
    noIntercept?: boolean;
    hint?: boolean;
};

export type HttpCustomConfig<D = any> = AxiosRequestConfig<D> & {
    retry?: boolean;
    noIntercept?: boolean;
    hint?: boolean;
};

export abstract class HttpPlugin {
    abstract request(client: HttpClient, config: HttpConfig): HttpConfig | Promise<HttpConfig>;
    abstract response(client: HttpClient, config: HttpConfig, value: HttpData): Promise<HttpData> | HttpData;
}

const NO_AUTH = 'NO_AUTH';
export class HttpClient {
    private instance: axios.AxiosInstance;
    private plugins: HttpPlugin[] = [];
    private storage: Storage;
    private logger!: HttpLogger | undefined;
    private lock = new Lock();
    constructor(private readonly option: HttpClientOptions) {
        const { platform, app, sign, version, prefix } = this.option.headers || {};
        this.storage = this.option.storage || new DefaultStorage();
        this.logger = option.logger;
        const baseHeaders = {
            app,
            sign,
            version,
            platform,
        }
        this.useRequestSuccess = this.useRequestSuccess.bind(this);
        this.useRequestError = this.useRequestError.bind(this);
        this.useResponseSuccess = this.useResponseSuccess.bind(this);
        this.useResponseError = this.useResponseError.bind(this);
        this.mergeDeviceId = this.mergeDeviceId.bind(this);
        this.mergeAuthToken = this.mergeAuthToken.bind(this);
        this.useResponsePipeline = this.useResponsePipeline.bind(this);
        this.refreshAuthToken = this.refreshAuthToken.bind(this);
        this.mergeTokenFromResponse = this.mergeTokenFromResponse.bind(this);
        this.get = this.get.bind(this);
        this.post = this.post.bind(this);
        this.delete = this.delete.bind(this);
        this.put = this.put.bind(this);
        this.head = this.head.bind(this);
        this.options = this.options.bind(this);
        this.request = this.request.bind(this);
        this.use = this.use.bind(this);
        this.instance = axios.create({
            baseURL: prefix,
            withCredentials: true,
            headers: baseHeaders
        });
        this.instance.interceptors.request.use(this.useRequestSuccess as any, this.useRequestError);
        this.instance.interceptors.response.use(this.useResponseSuccess, this.useResponseError);
    }

    private async mergeAuthToken(config: HttpConfig): Promise<HttpConfig> {
        const headers = { ...config.headers } as AxiosRequestHeaders;
        const refreshKey = get(this.option, 'token.refreshKey');
        const refreshPath = get(this.option, 'token.refreshPath');
        const access = get(this.option, 'token.accessKey', '')
        if (refreshPath && config.url?.endsWith(refreshPath) && refreshKey) {
            const refreshToken = await this.storage.get(refreshKey, '');
            if (refreshToken) {
                headers.Authorization = `Bearer ${refreshToken}`;
                config.headers = headers;
            }
            return config;
        }
        if (access) {
            const accessToken = await this.storage.get(access, '');
            if (accessToken) {
                headers.Authorization = `Bearer ${accessToken}`;
            }
        }
        config.headers = headers;
        return config;
    }

    private async mergeDeviceId(config: HttpConfig): Promise<HttpConfig> {
        const temp = { ...config.headers } as AxiosRequestHeaders;
        const deviceId = await this.storage.get("deviceId", "");
        const createId = get(this.option, 'headers.device');
        if (deviceId) {
            temp.device = deviceId;
            config.headers = temp;
            return Promise.resolve(config);
        }
        if (isFunction(createId)) {
            return createId().then(async (id) => {
                temp.device = id;
                await this.storage.set('deviceId', id);
                config.headers = temp;
                return config;
            });
        }
        return Promise.resolve(config);
    }

    private async mergeTokenFromResponse(value: axios.AxiosResponse<any, any>) {
        const refreshKey = get(this.option, 'token.refreshKey')!;
        const accessKey = get(this.option, 'token.accessKey', '')!;
        if (accessKey) {
            const accessToken = get(value, `headers.${accessKey}`, "");
            if (accessToken) {
                await this.storage.set(accessKey, accessToken);
            }
        }
        if (refreshKey) {
            const refreshToken = get(value, `headers.${refreshKey}`, "");
            if (refreshToken) {
                await this.storage.set(refreshKey, refreshToken);
            }
        }
    }

    private async refreshAuthToken(): Promise<boolean> {
        const refreshPath = get(this.option, 'token.refreshPath');
        if (!refreshPath) return false;
        if (!this.lock.isAcquired(NO_AUTH)) {
            await this.lock.acquire(NO_AUTH);
            const status = await this.get(refreshPath, { noIntercept: true, retry: false })
            .then((authRes) => isInclude([201, 399], authRes.status))
            .catch((error) => {
                this.logger?.error(`[HTTP REFRESH ERROR]: ${refreshPath}`, error);
                return false;
            });
            this.lock.release(NO_AUTH);
            return status;
        }
        return false;
    }

    private useResponsePipeline(config: HttpConfig, val: any) {
        const client = this;
        return reduce(this.plugins, (pre, plugin) => {
            return pre.then((value) => plugin.response(client, config, value));
        }, Promise.resolve(val));
    }

    private useRequestError(error: any) {
        const client = this;
        return reduce(this.plugins, (pre, plugin) => {
            return pre.then((value) => plugin.response(client, error, value));
        }, Promise.reject<HttpData>({ status: 500, code: 500, message: "请求异常" }));
    }

    private async useRequestSuccess(config: HttpConfig): Promise<HttpConfig> {
        const client = this;
        const refreshPath = get(this.option, 'token.refreshPath');
        const retry = get(this.option, 'retry', 0);
        // 刷新期间新请求先等待，避免带着过期 token 继续发送
        if (refreshPath && !config.url?.endsWith(refreshPath) && this.lock.isAcquired(NO_AUTH)) {
            await this.lock.acquire(NO_AUTH);
        }
        const temp = await this.mergeAuthToken(omit(config, ['retry']));
        if (isBoolean(config.retry) && !isNumber(temp.retry)) {
            temp.retry = retry;
        }
        const _config = await this.mergeDeviceId(temp);
        return reduce(this.plugins, (pre, plugin) => {
            return pre.then((value) => plugin.request(client, value));
        }, _config as Promise<HttpConfig> );
    }

    private async useResponseSuccess(value: axios.AxiosResponse<any, any>) {
        const url = get(value, "config.url", "");
        const refreshPath = get(this.option, 'token.refreshPath')!;
        const config = get(value, 'config', {}) as HttpConfig;
        const status = get(value, 'status', 500);
        const defaultStatus = {
            status: status,
            code: 500,
            message: "请稍后重试",
        }
        if (url.endsWith(refreshPath) && this.lock.isAcquired(NO_AUTH)) {
            this.lock.release(NO_AUTH);
        }
        const res = get(value, "data", defaultStatus);
        await this.mergeTokenFromResponse(value);
        this.logger?.info(`[HTTP SUCCESS]: ${url}`, value);
        if (config.noIntercept === true) return Promise.resolve(res);
        return this.useResponsePipeline(config, res);
    }

    private async useResponseError(error: any) {
        const refreshKey = get(this.option, 'token.refreshKey')!;
        const refreshPath = get(this.option, 'token.refreshPath')!;
        const url = get(error, "config.url", "") as string;
        const status = get(error, 'response.status', get(error, 'status', 500));
        const config = get(error, "config") as HttpConfig | undefined;
        const _retry = get(config, 'retry');
        const client = this;
        const defaultStatus = {
            status: status,
            code: status,
            message: "请稍后重试",
        }

        this.logger?.error(`[HTTP ERROR]: ${url}`, error);
        const res = get(error, "response", defaultStatus);
        this.logger?.error(`[HTTP RESPONSE ERROR]: ${url}`, res);
        if(isScope([500, 599], status) && config && isNumber(_retry) && _retry > 0) {
            config.retry = _retry - 1;
            return client.request(config as any)
        }
        if (isInclude([401, 403], status) && refreshKey && refreshPath) {
            if (url.endsWith(refreshPath) && this.lock.isAcquired(NO_AUTH)) {
                this.lock.release(NO_AUTH);
            }
            if (url.endsWith(refreshPath) || !config) {
                return Promise.reject(get(res, 'data', { status, code: status, message: "请求异常" }));
            }
            const refreshed = await this.refreshAuthToken();
            if (refreshed) {
                return this.instance.request(config);
            }
        }
        return Promise.reject(get(res, 'data', { status, code: status, message: "请求异常" }));
    }

    get cache() {
        return this.storage;
    }

    async clearAuth() {
        const refreshKey = get(this.option, 'token.refreshKey')!;
        const accessKey = get(this.option, 'token.accessKey', '')!;
        if (accessKey) {
            await this.storage.set(accessKey, '');
        }
        if (refreshKey) {
            await this.storage.set(refreshKey, '');
        }
    }

    use(plugin: HttpPlugin): HttpClient {
        const item = this.plugins.find((item) => item.constructor === plugin.constructor);
        if (item) return this;
        this.plugins.push(plugin);
        return this;
    }

    request<D = any, P = any>(config: HttpCustomConfig<P>): Promise<HttpData<D>> {
        return this.instance(config)
    }

    get<D = any>(url: string, config?: Omit<HttpCustomConfig, 'data'>): Promise<HttpData<D>> {
        return this.instance.get(url, config);
    }

    post<D = any, P = any>(url: string, data?: P, config?: Omit<HttpCustomConfig, 'data'>): Promise<HttpData<D>> {
        return this.instance.post(url, data, config);
    }

    delete<D = any>(url: string, config?: HttpCustomConfig): Promise<HttpData<D>> {
        return this.instance.delete(url, config);
    }

    put<D = any, P = any>(url: string, data?: P, config?: Omit<HttpCustomConfig, 'data'>): Promise<HttpData<D>> {
        return this.instance.put(url, data, config);
    }

    head<D = any>(url: string, config?: HttpCustomConfig): Promise<HttpData<D>> {
        return this.instance.head(url, config);
    }

    options<D = any>(url: string, config?: HttpCustomConfig): Promise<HttpData<D>> {
        return this.instance.options(url, config)
    }
}
