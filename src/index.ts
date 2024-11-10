import axios, { AxiosRequestHeaders } from "axios";
import { get } from "lodash";
import { getFingerprint, getToken, mergeHeaders, parseJson} from "./utils";
import Logger from './logger';
import {localStorageGetItem, localStorageSetItem, sessionStorageSetItem} from "./storage";


export interface IHttpOptions {
    refresh: string;
    auth: string;
	platform: number;
	system: number;
	app: string;
	version: string;
	sign: string;
}

export function clearToken() {
	sessionStorageSetItem('access-token', '');
	sessionStorageSetItem('refresh-token', '');
	localStorageSetItem('refresh-token', '');
	localStorageSetItem('access-token', '');
}

export default function create(url: string, options: IHttpOptions) {
    const { platform, system, app, sign, version, refresh, auth } = options;
	const api = axios.create({
		baseURL: url,
		withCredentials: true,
		headers: {
			app,
			sign,
			version,
			platform,
			system
		}
	});

    function refreshApi(config: any,) {
        return api.get(refresh)
        .then(() => api(config))
        .catch(() => {
            window.location.href = auth;
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