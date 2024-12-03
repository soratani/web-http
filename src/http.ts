import axios, { AxiosRequestHeaders } from "axios";
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
    platform: Platform;
    prefix: string;
    app: string;
    version: string;
    sign: string;
}

export abstract class HttpPlugin {
    abstract request(): Promise<any> | undefined;
    abstract response(): Promise<any> | undefined;
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
        this.instance = axios.create({
            baseURL: prefix,
            withCredentials: true,
            headers: baseHeaders
        });
        this.instance.interceptors.request.use(
            (config) => {
                const { headers } = config;
                const temp: Partial<AxiosRequestHeaders> = { ...headers };
                const fingerprintId = localStorageGetItem("fingerprintId", "");
                const token = getToken('access-token');
                if (token) {
                    temp.Authorization = `Bearer ${token}`
                }
                if (fingerprintId) {
                    temp.fingerprint = fingerprintId;
                    config.headers = mergeHeaders(temp);
                    return config;
                }
                return getFingerprint().then((id) => {
                    temp.fingerprint = id;
                    config.headers = mergeHeaders(temp);
                    return config;
                });
            },
            () => {
                return reduce(this.plugins, (pre, plugin) => {
                    return pre.then(plugin.response);
                }, Promise.reject({ code: 500, message: "请求异常" }));
            },
        );
        this.instance.interceptors.response.use(
            (value) => {
                const accessToken = get(value, "headers.access-token", "");
                const refreshToken = get(value, "headers.refresh-token", "");
                if (accessToken) {
                    localStorageSetItem("access-token", accessToken);
                }
                if (refreshToken) {
                    localStorageSetItem("refresh-token", refreshToken);
                }
                return get(value, "data", { code: 500, message: "请稍后重试" });
            },
            (error) => {
                Logger.error("HTTP ERROR", error)
                const res = get(error, "response.data", {
                    code: 500,
                    message: "请稍后重试",
                });
                return Promise.reject(res);
            },
        );
    }

    use(plugin: HttpPlugin) {
        const item = this.plugins.find((item) => item.constructor === plugin.constructor);
        if (item) return;
        this.plugins.push(plugin);
    }

    get(url: string, config?: axios.AxiosRequestConfig<any>) {
        return this.instance.get(url, config);
    }

    post(url: string, data?: any, config?: axios.AxiosRequestConfig<any>) {
        return this.instance.post(url, data, config);
    }

    delete(url: string, config?: axios.AxiosRequestConfig<any>) {
        return this.instance.delete(url, config);
    }

    put(url: string, data?: any, config?: axios.AxiosRequestConfig<any>) {
        return this.instance.put(url, data, config);
    }

    head(url: string, config?: axios.AxiosRequestConfig<any>) {
        return this.instance.head(url, config);
    }

    options(url: string, config?: axios.AxiosRequestConfig<any>) {
        return this.instance.options(url, config)
    }
}