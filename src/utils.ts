/* eslint-disable @typescript-eslint/no-unused-vars */
import fingerprint from "@fingerprintjs/fingerprintjs";

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

export async function getFingerprint() {
	try {
		const v = await fingerprint
			.load();
		const v_1 = await v.get();
		return v_1.visitorId;
	} catch {
		return "";
	}
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