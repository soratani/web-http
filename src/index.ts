import axios, { AxiosInstance, AxiosRequestHeaders } from "axios";
import { get, some } from "lodash";
import { getFingerprint, getSystemKey, getToken, mergeHeaders, parseJson} from "./utils";
import Logger from './logger';
import {localStorageGetItem, localStorageSetItem, sessionStorageSetItem} from "./storage";


interface IHttpOptions {
	auth: IAuthUrl
	platform: Platform;
	app: string;
	version: string;
	sign: string;
}

interface IAuthUrl {
	refresh: string;
    login: string;
}

export enum Platform {
	desktop,
	app,
	web,
	h5,
	cli,
	base,
}

export function clearToken() {
	sessionStorageSetItem('access-token', '');
	sessionStorageSetItem('refresh-token', '');
	localStorageSetItem('refresh-token', '');
	localStorageSetItem('access-token', '');
}

export default function create(prefix: string, options: IHttpOptions): AxiosInstance {
    const { platform, app, sign, version, auth } = options;
	const { refresh, login } = auth;
	const baseHeaders = {
		app,
		sign,
		version,
		platform,
	}
	if (!some([Platform.base, Platform.cli], (i) => i === platform)) {
		baseHeaders['system'] = getSystemKey()
	}

	const api = axios.create({
		baseURL: prefix,
		withCredentials: true,
		headers: baseHeaders
	});

    function refreshApi(config: any,) {
        return api.get(refresh)
        .then(() => api(config))
        .catch(() => {
            window.location.href = login;
        });
    }

	api.interceptors.request.use(
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
			return Promise.reject({ code: 500, message: "请求异常" });
		},
	);
	api.interceptors.response.use(
		(value) => {
			const accessToken = get(value, "headers.access-token", "");
			const refreshToken = get(value, "headers.refresh-token", "");
			const authParams = parseJson(value.config.data);
			const save = get(authParams, 'save', false);
			if (accessToken) {
				if (save) {
					localStorageSetItem("access-token", accessToken);
				} else {
					sessionStorageSetItem("access-token", accessToken);
				}
			}
			if (refreshToken) {
				if (save) {
					localStorageSetItem("refresh-token", refreshToken);
				} else {
					sessionStorageSetItem("refresh-token", refreshToken);
				}
			}
			return get(value, "data", { code: 500, message: "请稍后重试" });
		},
		(error) => {
            Logger.error("HTTP ERROR", error);
            const config = get(error, "config", {});
            const url = get(error, "config.url", "");
			const res = get(error, "response.data", {
				code: 500,
				message: "请稍后重试",
			});
            if (!url.includes(refresh) && res.code === 401) {
                return refreshApi(config);
            }
			return Promise.reject(res);
		},
	);
	return api;
}