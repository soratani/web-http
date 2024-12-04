function isString(str: any): str is string {
    return Object.prototype.toString.call(str) === '[object String]'
}

function getTime() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 月份从 0 开始，所以要加 1
  const day = now.getDate();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export default class Logger {
  static log(label: string, message: string) {
    return console.log(`%c ${label} %c ${message}`, 'background:#000;color:#fff;border-top-left-radius:4px;border-bottom-left-radius:4px;padding:4px', 'background:#ddd;border-top-right-radius:4px;border-bottom-right-radius:4px;padding:4px;color:#000');
  }
  static error(label: string, ...message: any) {
    if (message.length === 1 && isString(message[0])) {
      return console.log(`%c ${label} %c ${message[0]}`, 'background:#eb1168;color:#fff;border-top-left-radius:4px;border-bottom-left-radius:4px;padding:4px', 'background:#ddd;border-top-right-radius:4px;border-bottom-right-radius:4px;padding:4px;color:#000');
    }
    console.groupCollapsed(`%c ERROR %c${label}`, 'background:#eb1168;color:#fff;border-top-left-radius:4px;border-bottom-left-radius:4px;padding:4px', 'background:#ddd;border-top-right-radius:4px;border-bottom-right-radius:4px;padding:4px;color:#000');
    console.log(...message);
    console.groupEnd();
  }
  static warn(label: string, ...message: any) {
    if (message.length === 1 && isString(message[0])) {
      return console.log(`%c ${label} %c ${message[0]}`, 'background:#ffcc00;color:#fff;border-top-left-radius:4px;border-bottom-left-radius:4px;padding:4px', 'background:#ddd;border-top-right-radius:4px;border-bottom-right-radius:4px;padding:4px;color:#000');
    }
    console.groupCollapsed(`%c WARN %c${label}`, 'background:#ffcc00;color:#fff;border-top-left-radius:4px;border-bottom-left-radius:4px;padding:4px', 'background:#ddd;border-top-right-radius:4px;border-bottom-right-radius:4px;padding:4px;color:#000');
    console.log(...message);
    console.groupEnd();
  }
  static info(label: string, ...message: any) {
    if (message.length === 1 && isString(message[0])) {
      return console.log(`%c ${label} %c ${message[0]}`, 'background:#028f55;color:#fff;border-top-left-radius:4px;border-bottom-left-radius:4px;padding:4px', 'background:#ddd;border-top-right-radius:4px;border-bottom-right-radius:4px;padding:4px;color:#000');
    }
    console.groupCollapsed(`%c INFO %c${label}`, 'background:#028f55;color:#fff;border-top-left-radius:4px;border-bottom-left-radius:4px;padding:4px', 'background:#ddd;border-top-right-radius:4px;border-bottom-right-radius:4px;padding:4px;color:#000');
    console.log(...message);
    console.groupEnd();
  }
}