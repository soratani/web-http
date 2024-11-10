/* eslint-disable @typescript-eslint/no-unused-vars */

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