import { Storage } from "./http";

export class DefaultStorage extends Storage {
	get(key: string, value?: any) {
		try {
			return JSON.parse(localStorage.getItem(key));
		} catch (error) {
			return value;
		}
	}
	set(key: string, value: any) {
		localStorage.setItem(key, JSON.stringify(value));
	}
	
}