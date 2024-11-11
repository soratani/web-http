/* eslint-disable @typescript-eslint/no-unused-vars */
import fingerprint from "@fingerprintjs/fingerprintjs";
import {localStorageGetItem, localStorageSetItem, sessionStorageGetItem} from "./storage";
import { AxiosRequestHeaders } from "axios";

export function isPromise(obj?: any): obj is Promise<any> {
  return Object.prototype.toString.call(obj) === '[object Promise]'
}

export function parseJson(data: any) {
  try {
    return JSON.parse(data);
  } catch (error) {
    return undefined;
  }
}

export function getToken(key: string) {
	const local = localStorageGetItem(key, '');
	if (local) return local;
	return sessionStorageGetItem(key, '');
}

export async function getFingerprint() {
	try {
		const v = await fingerprint
			.load();
		const v_1 = await v.get();
		localStorageSetItem("fingerprintId", v_1.visitorId);
		return v_1.visitorId;
	} catch {
		return "";
	}
}

export function mergeHeaders(headers: Partial<AxiosRequestHeaders>): AxiosRequestHeaders {
	const accessToken = getToken("access-token");
	const refreshToken = getToken("refresh-token");
	if (accessToken) {
		headers.Authorization = `Bearer ${accessToken}`;
	}
	if (refreshToken) {
		headers["Refresh-Token"] = refreshToken;
	}
	return headers as AxiosRequestHeaders;
}

export function getSystem() {
	const userAgent = navigator.userAgent;
	let os = 'Unknown';
	if (/Windows NT/.test(userAgent)) {
	  os = 'Windows';
	} else if (/Mac/.test(userAgent)) {
	  os = 'Mac';
	} else if (/Linux/.test(userAgent)) {
	  os = 'Linux';
	} else if (/Android/.test(userAgent)) {
	  os = 'Android';
	} else if (/iPhone|iPad|iPod/.test(userAgent)) {
	  os = 'iOS';
	}
	return os;
  }
  
  export function getSystemKey() {
	const os = getSystem();
	switch (os) {
	  case 'Windows':
		return 2;
	  case 'Mac':
		return 4;
	  case 'Linux':
		return 3;
	  case 'Android':
		return 0;
	  case 'iOS':
		return 1;
	  default:
		return 5;
	}
  }