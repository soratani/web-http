/* eslint-disable @typescript-eslint/no-unused-vars */
export function localStorageAvailable(
	key = "__some_random_key_you_are_not_going_to_use__",
) {
	try {
		window.localStorage.setItem(key, key);

		window.localStorage.removeItem(key);

		return true;
	} catch (err) {
		return false;
	}
}

export function localStorageGetItem(key: string, defaultValue = "") {
	const storageAvailable = localStorageAvailable();

	let value;

	if (storageAvailable) {
		value = localStorage.getItem(key) || defaultValue;
	}

	return value;
}

export function localStorageSetItem(key: string, value: any) {
	localStorage.setItem(key, value);
}


export function sessionStorageAvailable(
	key = "__some_random_key_you_are_not_going_to_use__",
) {
	try {
		window.sessionStorage.setItem(key, key);

		window.sessionStorage.removeItem(key);

		return true;
	} catch (err) {
		return false;
	}
}

export function sessionStorageGetItem(key: string, defaultValue = "") {
	const storageAvailable = sessionStorageAvailable();

	let value;

	if (storageAvailable) {
		value = sessionStorage.getItem(key) || defaultValue;
	}

	return value;
}

export function sessionStorageSetItem(key: string, value: any) {
	sessionStorage.setItem(key, value);
}