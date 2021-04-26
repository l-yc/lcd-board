import { RoomInfo } from '../../Socket';

import { DrawingCanvas } from './DrawingCanvas';
import { DrawingMember } from './DrawingMember';

import { DrawingTool, Eraser } from './DrawingTool';

export class UI {

  readonly drawingCanvas: DrawingCanvas;

  readonly toolStatus  : HTMLElement | null;
  readonly membersStatus: HTMLElement | null;
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


  private cachedRoomInfo: RoomInfo | null = null;
  public updateRoomInfo(info: RoomInfo) {
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

  public login(uname: string | null, room: string | null) {
    this.logout();

    if (!uname || !room) {
      alert('You need to join a room with a username!');
      return;
    }
    this.loginUsername = uname;
    this.loginRoom = room;

    this.drawingCanvas.getSocketServer()?.register(uname);
    this.drawingCanvas.getSocketServer()?.join(room);

    const submit = document.querySelector('input[type=submit]') as HTMLInputElement;
    submit.disabled = true;
    submit.value = "Loading...";
  }

  private loginUsername: string | null = null;
  private loginRoom: string | null = null;
  public configureLoginForm() {
    const form = document.querySelector('#login-form') as HTMLFormElement;
    const submit = document.querySelector('input[type=submit]') as HTMLInputElement;
    const usernameField = document.getElementById('usernameField') as HTMLInputElement;
    const roomField = document.getElementById('roomField') as HTMLInputElement;

    if (form) form.addEventListener('submit', (event) => {
      event.preventDefault();
      let data = new FormData(form);
      let uname = data.get('username') as string;
      let room = data.get('room') as string;
      this.login(uname, room);
    });

    usernameField.addEventListener('keypress', (e) => {
      if (e.which == 13) {
        e.preventDefault()
        roomField.focus();
      }
    });

    const logoutButton = document.getElementById('disconnectBtn') as HTMLElement;
    logoutButton.onclick = (e) => this.logout();
  }

  public hideLoginOverlay() {
    const loginOverlay = document.getElementById('login-overlay');
    if (loginOverlay) {
      loginOverlay.style.opacity = '0';
      setTimeout(() => {
        loginOverlay.style.display = 'none';
        this.drawingCanvas.monitorKeyboardShortcuts = true;
      }, 250);
    }
  }

  public showLoginOverlay() {
    const loginOverlay = document.getElementById('login-overlay');
    if (loginOverlay) {
      loginOverlay.style.display = 'inline-block';
      loginOverlay.style.opacity = '1';
      this.drawingCanvas.monitorKeyboardShortcuts = false;
    }
  }

  public performLogout(options: {userInitiated?: boolean}) {
    this.drawingCanvas.monitorKeyboardShortcuts = false;
    const loginOverlay = document.getElementById('login-overlay');
    if (loginOverlay) {
      const isAlreadyLoggedOut = loginOverlay.style.opacity != '0';

      if (!isAlreadyLoggedOut) {
        this.showLoginOverlay()

        const usernameField = document.getElementById('usernameField') as HTMLInputElement;
        const roomField = document.getElementById('roomField') as HTMLInputElement;
        const submit = document.querySelector('input[type=submit]') as HTMLInputElement;

        if (usernameField && roomField) {
          usernameField.value = this.loginUsername || '';
          roomField.value = this.loginRoom || '';
        }

        usernameField.disabled = false;
        roomField.disabled = false;
        submit.disabled = false;
        submit.value = "Login";

        if (options && !options.userInitiated) {
          alert('error: lost connection to the server');
        }
      }
    }
  }
};
