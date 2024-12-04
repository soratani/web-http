import axios, { AxiosRequestConfig, AxiosRequestHeaders } from "axios";
import { get, reduce, some } from "lodash";
import { getFingerprint, getSystemKey, getToken, mergeHeaders } from "./utils";
import { localStorageGetItem, localStorageSetItem } from "./storage";
import Logger from "./logger";

export enum Platform {
    desktop,
    app,
    web,
    h5,
    cli,
    base,
}

export type HttpClientOptions = {
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

export type HttpConfig<D = any> = AxiosRequestConfig<D>;

export abstract class HttpPlugin {
    abstract request(client: HttpClient, config: HttpConfig): HttpConfig | Promise<HttpConfig>;
    abstract response(client: HttpClient,value: HttpData, config?: HttpConfig): Promise<HttpData> | HttpData;
}

export class HttpClient {
    private instance: axios.AxiosInstance;
    private plugins: HttpPlugin[] = [];
    constructor(private readonly option: HttpClientOptions) {
        const { platform, app, sign, version, prefix } = this.option;
        const baseHeaders = {
            app,
            sign,
            version,
            platform,
        }
        if (!some([Platform.base, Platform.cli], (i) => i === platform)) {
            baseHeaders['system'] = getSystemKey()
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

    private getTime() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1; // 月份从 0 开始，所以要加 1
        const day = now.getDate();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    private useRequestError() {
        const client = this;
        return reduce(this.plugins, (pre, plugin) => {
            return pre.then((value) => plugin.response(client, value));
        }, Promise.reject({ code: 500, message: "请求异常" }));
    }

    private useRequestSuccess(config: HttpConfig): HttpConfig| Promise<HttpConfig> {
        const { headers } = config;
        const client = this;
        const temp: Partial<AxiosRequestHeaders> = { ...headers } as any;
        const fingerprintId = localStorageGetItem("fingerprintId", "");
        const token = getToken('access-token');
        if (token) {
            temp.Authorization = `Bearer ${token}`
        }
        if (fingerprintId) {
            temp.fingerprint = fingerprintId;
            config.headers = mergeHeaders(temp);
            return reduce(this.plugins, async (pre, plugin) => {
                return pre.then((value) => plugin.request(client, value));
            }, Promise.resolve(config));
        }
        return reduce(this.plugins, async (pre, plugin) => {
            return pre.then((value) => plugin.request(client, value));
        }, getFingerprint().then((id) => {
            temp.fingerprint = id;
            config.headers = mergeHeaders(temp);
            return config;
        }));
    }

    private useResponseSuccess(value: axios.AxiosResponse<any, any>) {
        const accessToken = get(value, "headers.access-token", "");
        const refreshToken = get(value, "headers.refresh-token", "");
        const url = get(value, "config.url", "");
        const config = get(value, 'config', {}) as HttpConfig;
        const client = this;
        if (accessToken) {
            localStorageSetItem("access-token", accessToken);
        }
        if (refreshToken) {
            localStorageSetItem("refresh-token", refreshToken);
        }
        Logger.info(`[HTTP SUCCESS]: ${url}`, value);
        return reduce(this.plugins, (pre, plugin) => {
            return pre.then((value) => plugin.response(client, value, config));
        }, Promise.resolve(get(value, "data", { code: 500, message: "请稍后重试" })));
    }

    private useResponseError(error: any) {
        const url = get(error, "config.url", "");
        const status = get(error, 'status', 500);
        const config = get(error, "config", {});
        const client = this;
        Logger.error(`[HTTP ERROR]: ${url}`, error);
        const res = get(error, "response.data", {
            code: status,
            message: "请稍后重试",
        });
        if (!res) {
            return reduce(this.plugins, (pre, plugin) => {
                return pre.catch((value) => plugin.response(client, value, config));
            }, Promise.reject({
                code: status,
                message: "请稍后重试",
            }))
        }
        return reduce(this.plugins, (pre, plugin) => {
            return pre.catch((value) => plugin.response(client, value, config));
        }, Promise.reject(res))
    }

    clearAuth() {
        localStorageSetItem('refresh-token', '');
        localStorageSetItem('access-token', '');
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