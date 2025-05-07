import axios, { AxiosRequestConfig, AxiosRequestHeaders } from "axios";
import { get, isBoolean, isFunction, isNumber, reduce } from "lodash";
import { DefaultStorage, HttpLogger, Storage } from "./plugins";

export enum Platform {
    desktop,
    app,
    web,
    h5,
    cli,
    base,
}

export type HttpClientToken = {
    accessKey?: string;
    refreshKey?: string;
    refreshPath?: string;
}

export type HttpClientHeaders = {
    platform: Platform;
    prefix: string;
    app: string;
    version: string;
    sign: string;
}

export type HttpClientOptions = {
    storage?: Storage;
    logger?: HttpLogger;
    retry?: number;
    device?: () => Promise<string>;
    token?: HttpClientToken;
    headers: HttpClientHeaders;
}

export type HttpData<D = any> = {
    code: number;
    message: string;
    data?: D;
}

export type HttpConfig<D = any> = AxiosRequestConfig<D> & {
    retry?: number;
    noIntercept?: boolean;
    hint?: boolean;
};

export abstract class HttpPlugin {
    abstract request(client: HttpClient, config: HttpConfig): HttpConfig | Promise<HttpConfig>;
    abstract response(client: HttpClient, config: HttpConfig, value: HttpData): Promise<HttpData> | HttpData;
}

export class HttpClient {
    private instance: axios.AxiosInstance;
    private plugins: HttpPlugin[] = [];
    private storage: Storage;
    private logger: HttpLogger;
    private wait: Promise<boolean>;
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
        this.createWait = this.createWait.bind(this);
        this.mergeDeviceId = this.mergeDeviceId.bind(this);
        this.mergeAuthToken = this.mergeAuthToken.bind(this);
        this.useResponsePipeline = this.useResponsePipeline.bind(this);
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
        this.instance.interceptors.request.use(this.useRequestSuccess as any,this.useRequestError);
        this.instance.interceptors.response.use(this.useResponseSuccess, this.useResponseError);
    }

    private createWait() {
        let func;
        this.wait = new Promise((resolve) => {
            func = (status: boolean) => {
                resolve(status);
                this.wait = null;
            };
        })
        return func;
    }

    private mergeAuthToken(config: HttpConfig): HttpConfig {
        const headers = { ...config.headers } as AxiosRequestHeaders;
        const { accessKey, refreshKey } = get<HttpClientOptions, "token", HttpClientToken>(this.option, 'token', {});
        const refreshPath = get(this.option, 'token.refreshPath', '');
        if (refreshPath && config.url.endsWith(refreshPath) && refreshKey) {
            const refreshToken = this.storage.get(refreshKey, '');
            if (refreshToken) {
                headers.Authorization = `Bearer ${refreshToken}`;
            }
            return config;
        }
        if (accessKey) {
            const accessToken = this.storage.get(accessKey, '');
            if (accessToken) {
                headers.Authorization = `Bearer ${accessToken}`;
            }
        }
        config.headers = headers;
        return config;
    }

    private mergeDeviceId(config: HttpConfig): Promise<HttpConfig> {
        const temp = { ...config.headers } as AxiosRequestHeaders;
        const deviceId = this.storage.get("deviceId", "");
        const createId = get(this.option, 'device');
        if (deviceId) {
            temp.device = deviceId;
            config.headers = temp;
            return Promise.resolve(config);
        }
        if (isFunction(createId)) {
            return createId().then((id) => {
                temp.device = id;
                this.storage.set('deviceId', id);
                config.headers = temp;
                return config;
            });
        }
        return Promise.resolve(config);
    }

    private mergeTokenFromResponse(value: axios.AxiosResponse<any, any>) {
        const { accessKey, refreshKey } = get<HttpClientOptions, "token", HttpClientToken>(this.option, 'token', {});
        if (accessKey && refreshKey) {
            const accessToken = get(value, `headers.${accessKey}`, "");
            const refreshToken = get(value, `headers.${refreshKey}`, "");
            if (accessToken) {
                this.storage.set(accessKey, accessToken);
            }
            if (refreshToken) {
                this.storage.set(refreshKey, refreshToken);
            }
        }
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
        }, Promise.reject({ code: 500, message: "请求异常" }));
    }

    private async useRequestSuccess(config: HttpConfig): Promise<HttpConfig> {
        const client = this;
        const refreshPath = get(this.option, 'token.refreshPath', '');
        if (this.wait && !config.url.endsWith(refreshPath)) {
            await this.wait;
        }
        const _config = this.mergeDeviceId(this.mergeAuthToken(config));
        return reduce(this.plugins, async (pre, plugin) => {
            return pre.then((value) => plugin.request(client, value));
        }, _config);
    }

    private useResponseSuccess(value: axios.AxiosResponse<any, any>) {
        const url = get(value, "config.url", "");
        const config = get(value, 'config', {}) as HttpConfig;
        const defaultStatus = {
            code: 500,
            message: "请稍后重试",
        }
        const res = get(value, "data", defaultStatus);
        this.mergeTokenFromResponse(value);
        this.logger?.info(`[HTTP SUCCESS]: ${url}`, value);
        if (isBoolean(config.noIntercept) && !config.noIntercept) return Promise.resolve(res);
        return this.useResponsePipeline(config, res);
    }

    private async useResponseError(error: any) {
        const refreshPath = get(this.option, 'token.refreshPath', '');
        const refreshKey = get(this.option, 'token.refreshKey', '');
        const url = get(error, "config.url", "") as string;
        const status = get(error, 'status', 500);
        const config = get(error, "config", {}) as HttpConfig;
        const client = this;
        const defaultStatus = {
            code: status,
            message: "请稍后重试",
        }
        this.logger?.error(`[HTTP ERROR]: ${url}`, error);
        const res = get(error, "response.data", defaultStatus);
        if (refreshPath && refreshKey && status === 401 && !url.endsWith(refreshPath)) {
            const wait = this.createWait();
            const authRes = await client.get(refreshPath);
            if (authRes.code == 1) {
                wait(true);
                return this.instance.request(config);
            } else {
                wait(false);
            }
        }
        return this.useResponsePipeline(config, res);
    }

    get cache() {
        return this.storage;
    }

    clearAuth() {
        const { accessKey, refreshKey } = get<HttpClientOptions, "token", HttpClientToken>(this.option, 'token', {});
        if (accessKey) {
            this.storage.set(accessKey, '');
        }
        if (refreshKey) {
            this.storage.set(refreshKey, '');
        }
    }

    use(plugin: HttpPlugin): HttpClient {
        const item = this.plugins.find((item) => item.constructor === plugin.constructor);
        if (item) return;
        this.plugins.push(plugin);
    }

    request<D = any, P = any>(config: HttpConfig<P>): Promise<HttpData<D>> {
        return this.instance(config)
    }

    get<D = any>(url: string, config?: HttpConfig): Promise<HttpData<D>> {
        return this.instance.get(url, config);
    }

    post<D = any, P = any>(url: string, data?: any, config?: HttpConfig<P>): Promise<HttpData<D>> {
        return this.instance.post(url, data, config);
    }

    delete<D = any>(url: string, config?: HttpConfig): Promise<HttpData<D>> {
        return this.instance.delete(url, config);
    }

    put<D = any, P = any>(url: string, data?: P, config?: HttpConfig<P>): Promise<HttpData<D>> {
        return this.instance.put(url, data, config);
    }

    head<D = any>(url: string, config?: HttpConfig): Promise<HttpData<D>> {
        return this.instance.head(url, config);
    }

    options<D = any>(url: string, config?: HttpConfig): Promise<HttpData<D>> {
        return this.instance.options(url, config)
    }
}