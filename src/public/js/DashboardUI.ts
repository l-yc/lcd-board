
import { log, api, getCookie } from './utils';
export class DashboardUI {

  private showcaseGrid: HTMLElement;
  private showcaseCategoryItemContainers: HTMLElement[] = [];

  constructor() {
    this.showcaseGrid = document.querySelector(".showcase-grid") as HTMLElement;

    this.configureShowcaseCategoryItems();
  }

  private configureCategoryItemElement(title: string, subtitle: string, buttonConfigs: {title: string, destructive?: boolean, warning?: string, handler: (event: any) => void}[]): HTMLElement {
    let t1 = document.createElement('span') as HTMLSpanElement;
    let t1b = document.createElement('strong') as HTMLElement;
    t1b.style.fontSize = 'calc(var(--font-size) + 3px)';
    t1b.innerText = title;
    t1b.innerHTML += '<br>';
    t1.appendChild(t1b);

    let t2 = document.createElement('span') as HTMLSpanElement;
    t2.innerText = subtitle;

    let btnCont = document.createElement('div');
    btnCont.classList.add('category-buttons');
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
    e.classList.add('category-item');
    e.appendChild(t1);
    e.appendChild(t2);
    e.appendChild(btnCont);
    return e;
  }

  private configureCategoryItemError(msg: string) {
    let e = document.createElement('div') as HTMLDivElement;
    e.classList.add('category-item');
    e.classList.add('error');
    e.innerText = msg;
    return e;
  }

  private configureCategoryItemInfo(msg: string) {
    let e = document.createElement('div') as HTMLDivElement;
    e.classList.add('category-item');
    e.innerText = msg;
    return e;
  }

  private currentLoginMode: 'login' | 'guest' = 'login';
  public updateCurrentLoginMode(m: 'login' | 'guest') {
    this.currentLoginMode = m;
  }

  public configureShowcaseCategoryItems() {
    this.showcaseGrid.innerHTML = '';

    let headers = ["Popular Rooms", "Favourite Rooms", "Past Joined Rooms"];
    for (let h of headers) {
      let c = document.createElement('div') as HTMLDivElement;
      c.classList.add('showcase-category')
      c.innerHTML = '<h2>' + h + '</h2>';

      let catItemContainer = document.createElement('div') as HTMLDivElement;
      catItemContainer.classList.add('category-item-container');
      c.appendChild(catItemContainer);

      this.showcaseGrid.appendChild(c);
    }

    api(
      'retrievePopularRoomList', {},
      (res, status) => {

        if (res.success) {
          for (let room of res.data) {
            let ele = this.configureCategoryItemElement(
              room.displayName,
              'by ' + room.owner,
              [{
                title: 'Join',
                handler: (e) => {
                  this.joinRoom(room.roomId);
                }
              }]
            );
            this.showcaseGrid.children[0].appendChild(ele);
          }
        } else {
          let ele = this.configureCategoryItemError(res.error);
          this.showcaseGrid.children[0].appendChild(ele);
        }

      }
    );

    api(
      'retrieveFavouriteRoomList', {},
      (res, status) => {

        if (res.success) {
          for (let room of res.data) {
            let ele = this.configureCategoryItemElement(
              room.displayName,
              'by ' + room.owner,
              [{
                title: 'Join',
                handler: (e) => {
                  this.joinRoom(room.roomId);
                }
              },{
                title: 'Unfavourite',
                destructive: true,
                warning: 'This will remove the room from your favourites.',
                handler: (e) => {
                  api('deleteFavouriteRoom', {id: room.roomId}, (res, status) => {
                    if (res.success) {
                      console.log(ele);
                      ele.remove();
                    } else {
                      alert(res.data.error || res.error || 'Something went wrong.');
                      this.configureShowcaseCategoryItems();
                    }
                  });
                }
              }]
            );
            this.showcaseGrid.children[1].appendChild(ele);
          }
        } else {
          let ele = this.configureCategoryItemError(res.error);
          this.showcaseGrid.children[1].appendChild(ele);
        }

      }
    );
    api(
      'retrievePastJoinedRooms', {},
      (data, status) => {

        if (data.success) {
          for (let room of data.data) {
            let t = new Date(room.joinTimestamp);
            let ele = this.configureCategoryItemElement(
              room.displayName,
              'by ' + room.owner + '\n' + 'joined on ' +  t.toLocaleString(),
              [{
                title: 'Join',
                handler: (e) => {
                  this.joinRoom(room.roomId);
                }
              },{
                title: 'Hide',
                destructive: true,
                warning: 'This will remove the room from your history, unless you join it again.',
                handler: (e) => {
                  api('deletePastJoinedRoom', {id: room.roomId}, (res, status) => {
                    if (res.success) {
                      ele.remove();
                    } else {
                      alert(res.data.error || res.error || 'Something went wrong.');
                      this.configureShowcaseCategoryItems();
                    }
                  });
                }
              }]
            );
            this.showcaseGrid.children[2].appendChild(ele);
          }
        } else {
          let ele = this.configureCategoryItemError(data.error);
          this.showcaseGrid.children[2].appendChild(ele);
        }

      }
    );
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

