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

export type HttpClientOptions = {
    storage?: Storage;
    logger?: HttpLogger;
    fingerprint?: () => Promise<string>;
    platform?: Platform;
    prefix: string;
    app?: string;
    version?: string;
    sign?: string;
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
    constructor(private readonly option: HttpClientOptions) {
        const { platform, app, sign, version, prefix } = this.option;
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

    private mergeHeaders(headers: Partial<AxiosRequestHeaders>): AxiosRequestHeaders {
        const accessToken = this.storage.get("access-token", '');
        const refreshToken = this.storage.get("refresh-token", '');
        if (accessToken) {
            headers.Authorization = `Bearer ${accessToken}`;
        }
        if (refreshToken) {
            headers["Refresh-Token"] = refreshToken;
        }
        return headers as AxiosRequestHeaders;
    }

    private useRequestError(error: any) {
        const client = this;
        return reduce(this.plugins, (pre, plugin) => {
            return pre.then((value) => plugin.response(client, error, value));
        }, Promise.reject({ code: 500, message: "请求异常" }));
    }

    private useRequestSuccess(config: HttpConfig): HttpConfig| Promise<HttpConfig> {
        const { headers } = config;
        const client = this;
        const temp: Partial<AxiosRequestHeaders> = { ...headers } as any;
        const fingerprintId = this.storage.get("fingerprintId", "");
        const token = this.storage.get('access-token', '');
        const createId = get(this.option, 'fingerprint');
        if (token) {
            temp.Authorization = `Bearer ${token}`
        }
        if (fingerprintId) {
            temp.fingerprint = fingerprintId;
            config.headers = this.mergeHeaders(temp);
            return reduce(this.plugins, async (pre, plugin) => {
                return pre.then((value) => plugin.request(client, value));
            }, Promise.resolve(config));
        }
        if (isFunction(createId)) {
            return reduce(this.plugins, async (pre, plugin) => {
                return pre.then((value) => plugin.request(client, value));
            }, createId().then((id) => {
                temp.fingerprint = id;
                this.storage.set('fingerprintId', id);
                config.headers = this.mergeHeaders(temp);
                return config;
            }));
        }
        config.headers = this.mergeHeaders(temp);
        return reduce(this.plugins, async (pre, plugin) => {
            return pre.then((value) => plugin.request(client, value));
        }, Promise.resolve(config));
    }

    private useResponseSuccess(value: axios.AxiosResponse<any, any>) {
        const accessToken = get(value, "headers.access-token", "");
        const refreshToken = get(value, "headers.refresh-token", "");
        const url = get(value, "config.url", "");
        const config = get(value, 'config', {}) as HttpConfig;
        const client = this;
        const defaultStatus = {
            code: 500,
            message: "请稍后重试",
        }
        if (accessToken) {
            this.storage.set("access-token", accessToken);
        }
        if (refreshToken) {
            this.storage.set("refresh-token", refreshToken);
        }
        this.logger?.info(`[HTTP SUCCESS]: ${url}`, value);
        if (isBoolean(config.noIntercept) && !config.noIntercept) return Promise.resolve(get(value, "data", defaultStatus))
        return reduce(this.plugins, (pre, plugin) => {
            return pre.then((value) => plugin.response(client, config, value));
        }, Promise.resolve(get(value, "data", defaultStatus)));
    }

    private useResponseError(error: any) {
        const url = get(error, "config.url", "");
        const status = get(error, 'status', 500);
        const config = get(error, "config", {}) as HttpConfig;
        const client = this;
        const defaultStatus = {
            code: status,
            message: "请稍后重试",
        }
        this.logger?.error(`[HTTP ERROR]: ${url}`, error);
        // 重试逻辑
        if(isNumber(config.retry) && config.retry) {
            config.retry -=1;
            return this.instance.request(config);
        }
        const res = get(error, "response.data", defaultStatus);
        if (!res) {
            return reduce(this.plugins, (pre, plugin) => {
                return pre.catch((value) => plugin.response(client, config, value));
            }, Promise.reject(defaultStatus))
        }
        return reduce(this.plugins, (pre, plugin) => {
            return pre.catch((value) => plugin.response(client, config, value));
        }, Promise.reject(res))
    }

    get cache() {
        return this.storage;
    }

    clearAuth() {
        this.storage.set('refresh-token', '');
        this.storage.set('access-token', '');
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