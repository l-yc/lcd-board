let LOG = true;
let VERBOSE = false;

function generateGUIDv4(): string {
  let u = Date.now().toString(16) + Math.random().toString(16) + '0'.repeat(16);
  let guid = [u.substr(0,8), u.substr(8,4), '4000-8' + u.substr(13,3), u.substr(16,12)].join('-');
  return guid;
}

function setCookie(cname: string, cvalue: string, exdays: number) {
  let d = new Date();
  d.setTime(d.getTime() + (exdays*24*60*60*1000));
  let expires = "expires="+ d.toUTCString();
  document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
}

function getCookie(cname: string): string {
  let name = cname + "=";
  let decodedCookie = decodeURIComponent(document.cookie);
  let ca = decodedCookie.split(';');
  for(let i = 0; i <ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) == ' ') {
      c = c.substring(1);
    }
    if (c.indexOf(name) == 0) {
      return c.substring(name.length, c.length);
    }
  }
  return "";
}

function api(name: string, data: any, result: (data: any, status: number) => void) {
  let code = 0;
  if (['login', 'register', 'guest', 'logout'].indexOf(name) == -1 && !name.startsWith('api/')) {
    name = 'api/' + name;
  }
  fetch("/" + name, {
    method: 'POST',
    mode: 'cors',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'same-origin',
    body: JSON.stringify(data)
  })
  .then(res => {
    code = res.status;
    return res.json();
  })
  .then(data => {
    result(data, code);
  })
  .catch(err => {
    log('error occured in api call or handler', err);
  });
}

function log(...args: any) {
  if (!LOG || (!VERBOSE && args.length > 0 && args[0].verbose)) return;

  let time = new Date().toUTCString();
  console.log(`[${time}]`, '[LCD-BOARD]', ...args);
}

export { generateGUIDv4, log, api, getCookie, setCookie };
