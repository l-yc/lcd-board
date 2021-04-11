import { RoomInfo, LegacyRoomInfo } from '../../types';

import { DrawingCanvas } from './DrawingCanvas';
import { DrawingMember } from './DrawingMember';

import { DrawingTool, Eraser } from './DrawingTool';

import { api, getCookie } from './utils';

export class WhiteboardUI {

  readonly drawingCanvas: DrawingCanvas;

  readonly toolStatus  : HTMLElement | null;
  readonly membersStatus: HTMLElement | null;
  readonly lockedStatus: HTMLElement | null;
  readonly membersContainer: HTMLElement | null;
  readonly topBar: HTMLElement | null;
  readonly toolPickerContainer: HTMLElement | null;
  readonly colorPickerContainer: HTMLElement | null;
  readonly sizePickerContainer: HTMLElement | null;
  readonly sizePickerSlider: HTMLElement | null;

  constructor(canvas: DrawingCanvas) {
    this.drawingCanvas = canvas;
    canvas.setUI(this);

    //initialize all html elements
    this.toolStatus   = document.getElementById('toolStatus');
    this.membersStatus = document.getElementById('membersStatus');
    this.lockedStatus = document.getElementById('lockedStatus');
    this.membersContainer = document.getElementById('members-container')
    this.topBar = document.getElementById("top-banner-container");
    this.toolPickerContainer = document.getElementById('tool-picker-container');
    this.colorPickerContainer = document.getElementById('color-picker-container');
    this.sizePickerContainer = document.getElementById('size-picker-container');
    this.sizePickerSlider = document.getElementById('sizePickerSlider');

    //auto hide top bar on init
    this.setTopBarVisible(false, false);
  }

  private setStatusText(ele: HTMLElement | null, icon: string | null, text: string) {
    if (ele) {
      if (!icon) {
        ele.innerHTML = '<span>' + text + '</span>';
      }  else if (!icon.startsWith('la-')) {
        ele.innerHTML = '<span><span class="las">' + icon + '</span>&nbsp;' + text + '</span>';
      } else {
        ele.innerHTML = '<span><span class="las ' + icon + '"></span>&nbsp;' + text + '</span>';
      }
    }
  }

  private setStatusColor(ele: HTMLElement | null, color?: string | null) {
    if (ele) ele.style.borderColor = (color || '#0000');
  }

  public updateConnectionStatus(status: boolean) {
    if (!this.membersStatus) return;
    if (status) {
      this.setStatusColor(this.membersStatus, '#0d0');
      if (this.membersStatus.innerHTML.indexOf('Disconnected')) {
        this.setStatusText(this.membersStatus, 'la-user', 'Connected');
      }
    } else {
      this.setStatusColor(this.membersStatus, '#f00');
      this.setStatusText(this.membersStatus, 'la-user-alt-slash', 'Disconnected');
    }
  }

  public updateToolStatus() {
    if (!this.drawingCanvas || !this.toolStatus) return;

    let activeTool = this.drawingCanvas.getActiveTool();
    this.setStatusColor(this.toolStatus, activeTool.getColor());
    this.setStatusText(this.toolStatus, activeTool.icon, activeTool.name);

    let sizeSlider = this.sizePickerSlider as HTMLInputElement;
    if (sizeSlider) {
      let minSize = activeTool.minSize || 2;
      let size = activeTool.getSize();
      let maxSize = Math.min(activeTool.maxSize || 50, 50) + minSize;
      if (activeTool instanceof Eraser) {
        maxSize = 150;
      }
      sizeSlider.min   = '' + minSize;
      sizeSlider.max   = '' + maxSize;
      sizeSlider.value = '' + size;
    }
  }

  private cachedRoomInfo: LegacyRoomInfo | null = null;
  public updateRoomInfo(info: LegacyRoomInfo) {
    if (!this.membersContainer) return;

    const canvas = this.drawingCanvas;
    let drawingMembers: DrawingMember[] = [];

    this.membersContainer.innerHTML = "";

    for (let userId in info.users) {
      if (!info.users.hasOwnProperty(userId)) return;

      if (canvas) drawingMembers.push(new DrawingMember(userId, info.users[userId], canvas));

      let u = document.createElement('span');
      u.innerText = info.users[userId].username as string;
      this.membersContainer.appendChild(u);
    };

    let iconChoice : string;
    switch (drawingMembers.length) {
      case 0: iconChoice = 'la-user-alt-slash'; break;
      case 1: iconChoice = 'la-user'; break;
      case 2: iconChoice = 'la-user-friends'; break;
      default: iconChoice = 'la-users'; break;
    }
    this.setStatusText(this.membersStatus, iconChoice, drawingMembers.length + ' online');

    if (canvas) canvas.setDrawingMembers(drawingMembers);

    this.cachedRoomInfo = info;
  }

  protected topBarVisible = true;
  public setTopBarVisible(visible: boolean, animated?: boolean) {
    if (!this.topBar) return;

    let elements = Array.from(this.topBar.children).slice(1);
    for (let ele of elements) {
      let htmlEle = ele as HTMLElement;
      htmlEle.style.height = visible ? '44px' : '0';
      htmlEle.style.transform = visible ? 'none' : 'translateY(-44px)';
      htmlEle.style.opacity = visible ? '1' : '0';
      htmlEle.style.pointerEvents = visible ? 'auto' : 'none';

      if (animated !== undefined && animated === false) {
        htmlEle.style.display = 'none';
        setTimeout(() => {
          htmlEle.style.display = 'inline-block' ;
        }, 200);
      }

    };
    this.topBarVisible = visible;
  }
  public isTopBarVisible() {
    return this.topBarVisible;
  }

  public configureStatusIndicators() {
    if (this.toolStatus) {
      this.toolStatus.onclick = (e) => { this.setTopBarVisible(!this.topBarVisible); };
      this.updateToolStatus()
    }
    if (this.membersStatus) {
      this.membersStatus.onclick = (e) => { this.setTopBarVisible(!this.topBarVisible); };
    }
  }

  public configurePickers() {
    if (!this.drawingCanvas) return;

    let prevActiveTool = this.drawingCanvas.getActiveTool();

    // Tool Picker
    const toolPickerContainer = this.toolPickerContainer;
    if (toolPickerContainer) {
      toolPickerContainer.innerHTML = '';

      const activeTool = this.drawingCanvas.getActiveTool();
      for (let tool of this.drawingCanvas.getTools()) {
        tool.interceptPressureEventsOnCanvas(this.drawingCanvas.htmlCanvas);

        const button = document.createElement("button");
        button.innerHTML = tool.icon || tool.name;
        button.classList.add('las', 'toolOption');

        if (tool == activeTool)
          button.classList.add('selectedOption');

        button.onclick = () => {
          if (this.drawingCanvas?.getActiveTool() == tool) return;
          prevActiveTool = this.drawingCanvas?.getActiveTool() || prevActiveTool;

          this.drawingCanvas?.setActiveTool(tool);

          let allOptions = Array.from(toolPickerContainer.getElementsByClassName('toolOption'));
          for (let option of allOptions) {
            option.classList.remove('selectedOption');
          };
          button.classList.add('selectedOption');

          this.updateToolStatus();
        }

        toolPickerContainer.appendChild(button);
      }
    }

    // Color Picker
    const colorPickerContainer = this.colorPickerContainer;
    if (colorPickerContainer) {
      colorPickerContainer.innerHTML = '';
      let activeColor = this.drawingCanvas.getActiveColor();

      for (let color of this.drawingCanvas.getColors()) {
        const button = document.createElement("button");

        button.style.backgroundColor = color;;
        button.classList.add('colorOption');

        if (color == activeColor)
          button.classList.add('selectedOption');

        button.onclick = () => {
          this.drawingCanvas?.setActiveColor(color);

          let allOptions = Array.from(colorPickerContainer.getElementsByClassName('colorOption'));
          for (let option of allOptions) {
            option.classList.remove('selectedOption');
          };
          button.classList.add('selectedOption');

          if (this.drawingCanvas?.getActiveTool() instanceof Eraser) {
            this.drawingCanvas?.setActiveTool(prevActiveTool);
          }

          this.updateToolStatus();
        }
        colorPickerContainer.appendChild(button);
      }

      let cachedColor = '#ffffff'
      const colorPickerButton = document.createElement("button");
      colorPickerButton.classList.add('colorOption', 'colorPicker');
      colorPickerButton.onclick = () => {
        let result = prompt("Enter hex color code (#??????):", cachedColor) || "";
        this.drawingCanvas?.setActiveColor(result);
        if (result == this.drawingCanvas?.getActiveColor()) {
          let allOptions = Array.from(colorPickerContainer.getElementsByClassName('colorOption'));
          for (let option of allOptions) {
            option.classList.remove('selectedOption');
          };
          colorPickerButton.classList.add('selectedOption');
          colorPickerButton.style.backgroundColor = result;
          cachedColor = result;

          if (this.drawingCanvas?.getActiveTool() instanceof Eraser) {
            this.drawingCanvas?.setActiveTool(prevActiveTool);
          }

          this.updateToolStatus();
        }
      }
      colorPickerContainer.appendChild(colorPickerButton);
    }

    // Size Picker
    const sizePickerSlider = this.sizePickerSlider as HTMLInputElement;
    if (sizePickerSlider) {
      sizePickerSlider.onchange = () => {
        this.drawingCanvas?.getActiveTool().setSize(+sizePickerSlider.value);
      }
    }

    this.updateToolStatus();
  }


  // login handlers
  public logout() {
    this.drawingCanvas.getSocketServer()?.leave();
  }
  public logoutAndLeaveRoom() {

    if (this.loginRoomId) {
      api('recordDisconnectRoom', {id: this.loginRoomId}, (res, status) => {
        console.log('recDisc', res);
      });
      this.loginRoomId = null;
      this.loginRoom = null;
      this.loginRoomWhiteboard = null;
      this.loginRoomInfo = null;
    }

    this.logout();

    window.history.replaceState({}, document.title, location.origin + location.pathname);
    let cover = document.getElementById('wbFSCover') as HTMLDivElement;
    cover.classList.remove('hidden');
  }

  private loginRoomInfo: RoomInfo | null = null;
  private loginUsername: string | null = null;
  private loginRoomId: string | null = null;
  private loginRoom: string | null = null;
  private loginRoomWhiteboard: string | null = null;
  public configureLoginForm() {
    const form = document.querySelector('#room-login-form') as HTMLFormElement;

    const usernameField = document.getElementById('wbUsernameField') as HTMLInputElement;
    const roomField = document.getElementById('wbRoomField') as HTMLInputElement;
    const roomIdField = document.getElementById('wbRoomIdField') as HTMLInputElement;
    const whiteboardField = document.getElementById('wbWhiteboardField') as HTMLSelectElement;
    const submit = document.querySelector('input[type=submit]#wbJoin') as HTMLInputElement;

    if (form) form.addEventListener('submit', (event) => {
      event.preventDefault();
      let data = new FormData(form);
      let uname = usernameField.value as string;
      let roomId = roomIdField.value as string;
      let room = roomField.value as string;
      let roomWb = whiteboardField.value as string;
      if (!uname || !roomId || !roomWb) {
        alert('You need to choose a whiteboard!');
        return;
      }

      this.loginUsername = uname;
      this.loginRoom = room;
      this.loginRoomId = roomId;
      this.loginRoomWhiteboard = roomWb;
      
      for (let wb of this.loginRoomInfo?.whiteboards || []) {
        if (wb.name == roomWb) {
          if (wb.locked) this.lockedStatus?.classList.remove('hidden');
          else this.lockedStatus?.classList.add('hidden');
          break;
        }
      }

      this.drawingCanvas.getSocketServer()?.register(uname);
      this.drawingCanvas.getSocketServer()?.join(roomId + '_' + roomWb);

      submit.disabled = true;
      submit.value = "Loading...";
    });

    const logoutButton = document.getElementById('disconnectBtn') as HTMLElement;
    logoutButton.onclick = (e) => this.logout();
    const leaveRoomButton = document.getElementById('rmwbLeave') as HTMLElement;
    leaveRoomButton.onclick = (e) => this.logoutAndLeaveRoom();
  }

  private currentLoginMode: 'login' | 'guest' = 'login';
  public updateCurrentLoginMode(m: 'login' | 'guest') {
    this.currentLoginMode = m;
  }

  public configureLoginFormFields(username: string, room: RoomInfo) {

    if (this.loginRoomId != room.id) {
      this.logoutAndLeaveRoom();
      api('recordJoinRoom', {id: room.id}, (res, status) => {
        console.log('recJoin', res);
      });
    }

    if (room.whiteboards.length == 0) {
      alert(
        'No Whiteboards Found!\n'+
          'Ask the owner to set the room to active, and create a whiteboard before joining.'
      );
      return;
    }

    const cover = document.getElementById('wbFSCover') as HTMLDivElement;
    cover.classList.add('hidden');

    const loginOverlay = document.getElementById('room-login-overlay') as HTMLDivElement;
    const isAlreadyLoggedOut = loginOverlay?.style.opacity != '0';

    const usernameField = document.getElementById('wbUsernameField') as HTMLInputElement;
    const roomField = document.getElementById('wbRoomField') as HTMLInputElement;
    const roomIdField = document.getElementById('wbRoomIdField') as HTMLInputElement;
    const whiteboardField = document.getElementById('wbWhiteboardField') as HTMLSelectElement;

    const favouriteA = document.getElementById('favouriteBtn') as HTMLLinkElement;
    const permalinkA = document.getElementById('roomJoinLink') as HTMLLinkElement;

    whiteboardField.innerHTML = '';
    for (var i = 0; i < room.whiteboards.length; i++) {
      var option = document.createElement("option");
      option.value = room.whiteboards[i].name;
      option.text = room.whiteboards[i].name;
      whiteboardField.appendChild(option);
    }

    if (isAlreadyLoggedOut) {
      usernameField.value = username;
      roomField.value = room.displayName + ' by ' + room.owner;
      roomIdField.value = room.id;
      let link = location.origin + location.pathname + '?room-join=' + encodeURIComponent(room.id);
      permalinkA.href = link;
      permalinkA.innerText = link;
      whiteboardField.value = room.whiteboards.length > 0 ? room.whiteboards[0].name : '-- No Whiteboard --';
    }
    this.loginRoomInfo = room;
    this.loginUsername = username;
    this.loginRoom = room.displayName + ' by ' + room.owner;
    this.loginRoomId= room.id;
    this.loginRoomWhiteboard = room.whiteboards.length > 0 ? room.whiteboards[0].name : '-- No Whiteboard --';



    favouriteA.classList.remove('hidden');
    favouriteA.style.visibility = 'hidden';

    let id = room.id;
    if (this.currentLoginMode == 'login') api('isFavouriteRoom', {id: id}, (res, status) => {
      if (res.success) {
        favouriteA.style.visibility = 'visible';
        favouriteA.innerText = res.data ? 'Unfavourite' : 'Favourite';
        favouriteA.onclick = (e) => {
          if (favouriteA.innerText == 'Unfavourite') {
            api('deleteFavouriteRoom', {id: id}, (res, status) => {
                favouriteA.innerText = res.success ? 'Favourite' : 'Unfavourite';
            });
          } else {
            api('addFavouriteRoom', {id: id}, (res, status) => {
                favouriteA.innerText = res.success ? 'Unfavourite' : 'Favourite';
            });
          }
        }
      }
    });
    else favouriteA.classList.add('hidden');
  }

  public hideLoginOverlay() {
    const loginOverlay = document.getElementById('room-login-overlay');
    if (loginOverlay) {
      loginOverlay.style.opacity = '0';
      setTimeout(() => {
        loginOverlay.style.display = 'none';
        this.drawingCanvas.monitorKeyboardShortcuts = true;
      }, 250);
    }
  }

  public showLoginOverlay() {
    const loginOverlay = document.getElementById('room-login-overlay');
    if (loginOverlay) {
      loginOverlay.style.display = 'inline-block';
      loginOverlay.style.opacity = '1';
      this.drawingCanvas.monitorKeyboardShortcuts = false;
    }
  }

  public performLogout(options: {userInitiated?: boolean}) {
    this.drawingCanvas.monitorKeyboardShortcuts = false;
    const loginOverlay = document.getElementById('room-login-overlay');
    if (loginOverlay) {
      const isAlreadyLoggedOut = loginOverlay.style.opacity != '0';

      if (!isAlreadyLoggedOut) {
        this.showLoginOverlay()

        const usernameField = document.getElementById('wbUsernameField') as HTMLInputElement;
        const roomField = document.getElementById('wbRoomField') as HTMLInputElement;
        const roomIdField = document.getElementById('wbRoomIdField') as HTMLInputElement;
        const whiteboardField = document.getElementById('wbWhiteboardField') as HTMLInputElement;
        const submit = document.querySelector('input[type=submit]#wbJoin') as HTMLSelectElement;

        if (usernameField && roomField) {
          usernameField.value = this.loginUsername || '';
          roomField.value = this.loginRoom || '';
          roomIdField.value = this.loginRoomId || '';
          whiteboardField.value = this.loginRoomWhiteboard || '';
        }

        whiteboardField.disabled = false;
        submit.disabled = false;
        submit.value = "Launch Whiteboard";

        if (options && !options.userInitiated) {
          alert('error: lost connection to the server');
        }
      }
    }
    if (this.loginRoomId) {
      api('retrieveRoomInfo', {id: this.loginRoomId}, (res, status) => {
        if (res.success) {
          if (this.loginUsername) {
            this.configureLoginFormFields(this.loginUsername, res.data);
          }
        }
      })
    }

  }
};
