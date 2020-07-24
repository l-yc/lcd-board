let LOG = true;
let VERBOSE = false;

function generateGUIDv4(): string {
  let u = Date.now().toString(16) + Math.random().toString(16) + '0'.repeat(16);
  let guid = [u.substr(0,8), u.substr(8,4), '4000-8' + u.substr(13,3), u.substr(16,12)].join('-');
  return guid;
}

function log(...args: any) {
  if (!LOG || (!VERBOSE && args.length > 0 && args[0].verbose)) return;

  let time = new Date().toUTCString();
  console.log(`[${time}]`, '[LCD-BOARD]', ...args);
}

export { generateGUIDv4, log };
