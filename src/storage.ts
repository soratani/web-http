import { Storage } from "./http";

export class DefaultStorage extends Storage {
	get(key: string, value?: any) {
		try {
			// @ts-ignore
			return JSON.parse(localStorage.getItem(key));
		} catch (error) {
			return value;
		}
	}
	set(key: string, value: any) {
		// @ts-ignore
		localStorage.setItem(key, JSON.stringify(value));
	}
	
}