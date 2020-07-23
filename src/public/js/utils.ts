let LOG = true;
let VERBOSE = true;

function log(...args: any) {
  if (!LOG || (!VERBOSE && args.length > 0 && args[0].verbose)) return;

  let time = new Date().toUTCString();
  console.log(`[${time}]`, '[LCD-BOARD]', ...args);
}

export { log };
