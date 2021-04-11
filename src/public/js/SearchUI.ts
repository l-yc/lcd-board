

import { log, api, getCookie } from './utils';
export class SearchUI {

  private searchForm: HTMLFormElement;
  private searchBar: HTMLInputElement;
  private searchSubmit: HTMLInputElement;
  private searchGrid: HTMLElement;

  constructor() {
    this.searchGrid = document.querySelector(".search-grid") as HTMLElement;
    this.searchForm = document.querySelector("#search-form") as HTMLFormElement;
    this.searchBar = document.querySelector(".search-bar") as HTMLInputElement;
    this.searchSubmit = document.querySelector(".search-submit") as HTMLInputElement;
  }

  private configureSearchItemElement(title: string, subtitle: string, buttonConfigs: {title: string, destructive?: boolean, warning?: string, handler: (event: any) => void}[]): HTMLElement {
    let t1 = document.createElement('span') as HTMLSpanElement;
    let t1b = document.createElement('strong') as HTMLElement;
    t1b.style.fontSize = 'calc(var(--font-size) + 3px)';
    t1b.innerText = title;
    t1b.innerHTML += '<br>';
    t1.appendChild(t1b);

    let t2 = document.createElement('span') as HTMLSpanElement;
    t2.innerText = subtitle;

    let btnCont = document.createElement('div');
    btnCont.classList.add('search-buttons');
    for (let config of buttonConfigs) {

      let a = document.createElement('a') as HTMLElement;
      a.innerText = config.title;
      if (config.destructive) {
        a.classList.add('destructive');
      }
      if (config.warning) {
        a.onclick = (e) => { if (confirm('Are you sure?\n' + config.warning)) config.handler(e); };
      } else {
        a.onclick = config.handler;
      }

      btnCont.appendChild(a);
    }

    let e = document.createElement('div') as HTMLDivElement;
    e.classList.add('search-item');
    e.appendChild(t1);
    e.appendChild(t2);
    e.appendChild(btnCont);
    return e;
  }

  private configureSearchItemError(msg: string) {
    let e = document.createElement('div') as HTMLDivElement;
    e.classList.add('search-item');
    e.classList.add('error');
    e.innerText = msg;
    return e;
  }

  private configureSearchItemInfo(msg: string) {
    let e = document.createElement('div') as HTMLDivElement;
    e.classList.add('search-item');
    e.innerText = msg;
    return e;
  }

  private autoSubmitSearchTimeout: ReturnType<typeof setTimeout> | null = null;
  public configureSearchBar() {
    this.searchGrid.innerHTML = '';
    this.searchBar.oninput = (e) => {
      if (this.searchBar.value.trim() == '') {
        this.searchGrid.innerHTML = ''; return;
      } else {
        this.showAsLoading();

        //auto search after 500ms delay
        if (this.autoSubmitSearchTimeout) {
          clearTimeout(this.autoSubmitSearchTimeout);
          this.autoSubmitSearchTimeout = null;
        }
        this.autoSubmitSearchTimeout = setTimeout(() => {
          this.parseAndPerformSearch(this.searchBar.value);
        }, 300);
      }
      window.history.replaceState({}, document.title, location.origin + location.pathname);
    }
    this.searchBar.addEventListener('search', (e) => {
      if (this.searchBar.value == '')
        window.history.replaceState( {} , document.title, location.origin + location.pathname);
    });
    this.searchForm.onsubmit = (e) => {
      e.preventDefault();

      //submitting the search query instantly initiates search
      if (this.autoSubmitSearchTimeout) {
        clearTimeout(this.autoSubmitSearchTimeout);
        this.autoSubmitSearchTimeout = null;
      }
      this.parseAndPerformSearch(this.searchBar.value);
    }

    let sQuery = new URLSearchParams(location.search).get("roomSearch");
    if (sQuery) {
      this.searchBar.value = sQuery;
      this.parseAndPerformSearch(sQuery);
    }
  }

  public showAsLoading() {
    this.searchGrid.innerHTML = '<div style="margin: auto; padding: 32px;">Loading...</div>';
  }

  public parseSearch(query: string): any {
    query = query.trim();
    let searchParams : any = {}

    let idMatches = query.match(/\b[A-Za-z0-9+\/=]{24}\b/g);
    if (idMatches) searchParams.roomId = idMatches[0];

    let remQ = '';
    let wb = '';
    let ou = '';
    let isInWhiteboard = false;
    let isInOwnerUname = false;
    let justTerminated = false;
    let wasWhitespace = true;
    for (let i = 0; i < query.length; i++) {
      let c = query.charAt(i);
      if (!isInWhiteboard && !isInOwnerUname) {
        if (c == '%' && wasWhitespace) {
          justTerminated = false;
          isInWhiteboard = true;
        } else if (c == '@' && wasWhitespace) {
          justTerminated = false;
          isInOwnerUname = true;
        } else if (justTerminated && c == ' ') {
          wasWhitespace = true;
        } else {
          justTerminated = false;
          if (wasWhitespace) remQ += ' ';
          if (c != ' ') remQ += c;
        }
      } else if (isInWhiteboard) {
        if (c == ';') {
          isInWhiteboard = false;
          justTerminated = true;
        } else {
          wb += c;
        }
      } else if (isInOwnerUname) {
        if (c == ';') {
          isInOwnerUname = false;
          justTerminated = true;
        } else {
          ou += c;
        }
      }
      wasWhitespace = c == ' ';
    }

    let keywordSearch = /\b(isPublic|isActive)=([yYnNtTfF01])[\w]{0,4}(;|\b|)/g;
    for (let keyword of remQ.match(keywordSearch) || []) {
      let terms = keyword.split('=');
      let key = terms[0];
      let yes = ('yYtT1'.indexOf(terms[1].charAt(0)) != -1);
      if (searchParams[key] === undefined) {
        searchParams[key] = yes;
      }
    }

    remQ = remQ.split(keywordSearch)[0];

    if (remQ != '') searchParams.roomName = remQ.trim();
    if (wb != '') searchParams.whiteboardName = wb.trim();
    if (ou != '') searchParams.owner = ou.trim();

    return searchParams;
  }

  public parseAndPerformSearch(query: string) {
    this.showAsLoading();

    //parsing
    let searchParams = this.parseSearch(query);
    if (Object.entries(searchParams).length == 0) {
      this.searchGrid.innerHTML = '';

      if (query.trim() != '') {
        let ele = this.configureSearchItemInfo('Nothing to search.');
        this.searchGrid.appendChild(ele);
      }
      return;
    }

    //send request
    log('search', searchParams);
    api('retrieveRoomSearchResults', {data: searchParams}, (res, status) => {
      this.searchGrid.innerHTML = '';
      if (res.success) {
        for (let room of res.data) {
          let ele = this.configureSearchItemElement(
              room.displayName,
              'by ' + room.owner,
              [{
                title: 'Join',
                handler: (e) => {
                  this.joinRoom(room.roomId);
                }
              }]
            );
          this.searchGrid.appendChild(ele);
        }

        if (res.data.length == 0) {
          let ele = this.configureSearchItemInfo('No results found.');
          this.searchGrid.appendChild(ele);
        }
      } else {
        let ele = this.configureSearchItemError(res.error);
        this.searchGrid.appendChild(ele);
      }
    })
  }

  private joinRoomHandler: ((roomId: string) => void) | null = null;
  public setJoinRoomHandler(handler: (roomId: string) => void) {
    this.joinRoomHandler = handler;
  }
  public joinRoom(roomId: string) {
    if (this.joinRoomHandler) this.joinRoomHandler(roomId);
    else alert('error: ui link to whiteboard tab missing');
  }

}

