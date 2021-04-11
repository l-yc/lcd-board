'use strict';
import paper from 'paper';

import { log, api, getCookie, setCookie } from './utils';
import { DrawingTool, Pen, DynamicPen, FountainPen, Eraser, LaserPointer, Selector } from './DrawingTool';
import { DrawingCanvas } from './DrawingCanvas';
import { SocketServer } from './SocketServer';
import { WhiteboardUI } from './WhiteboardUI';
import { DashboardUI } from './DashboardUI';
import { SearchUI } from './SearchUI';
import { RoomEditorUI } from './RoomEditorUI';

let tabs: {[id: string]: HTMLDivElement} = {};
let tabBtns: {[id: string]: HTMLSpanElement} = {};
let tabBtnHandlers: {[id: string]: () => void} = {};
let onTabOpenHandlers: {[id: string]: () => void} = {};
let currentLoginFormMode: 'login' | 'register' | 'guest' = 'login';

let drawingCanvas: DrawingCanvas | null;
let socketServer: SocketServer | null;
let whiteboardUi: WhiteboardUI | null;
let dashboardUi: DashboardUI | null;
let searchUi: SearchUI | null;
let roomEditorUi: RoomEditorUI | null;

let joinRoomHandler = (roomId: string, notify?: boolean) => {
  api('retrieveRoomInfo', {id: roomId}, (res, status) => {
    console.log(res);
    if (res.success) {
      tabBtnHandlers['whiteboard']();
      whiteboardUi?.configureLoginFormFields(getUsername(), res.data);
    } else if (notify !== false) {
      alert('Error: ' + res.error);
    }
  });
}

window.onload = () => {

  const canvas = document.getElementById('myCanvas');
  if (!canvas) {
    log("something's terribly wrong: the canvas is missing. aborting operations.");
    alert("Catastrophic error: Missing Drawing Canvas");
    return;
  }

  paper.setup('myCanvas');
  log("configured paper.js canvas");

  //Universal setup
  let modeStored = getCookie('LCDB_LoginMode'); //loads previously used cached login mode
  if (modeStored == 'login' || modeStored == 'guest') currentLoginFormMode = modeStored;

  configureTabBar();
  configureLoginForm();
  updateLoginOverlayState();

  //Dashboard UI Setup
  dashboardUi = new DashboardUI();
  dashboardUi?.setJoinRoomHandler(joinRoomHandler);

  onTabOpenHandlers['dashboard'] = () => {
    let lM = currentLoginFormMode;
    lM = lM == 'register' ? 'login' : lM;
    dashboardUi?.updateCurrentLoginMode(lM);
    dashboardUi?.configureShowcaseCategoryItems()
  }

  //Search UI setup
  searchUi = new SearchUI();
  searchUi?.setJoinRoomHandler(joinRoomHandler);

  onTabOpenHandlers['room-search'] = () => {
    searchUi?.configureSearchBar();
  }


  //My Rooms & Room Editor UI
  roomEditorUi = new RoomEditorUI();
  roomEditorUi?.setJoinRoomHandler(joinRoomHandler);

  onTabOpenHandlers['my-rooms'] = () => {
    roomEditorUi?.configureRoomItems()
  }

  //Drawing UI Setup

  const tools = [
    new Pen(),
    new DynamicPen(),
    new FountainPen(),
    new Eraser(),
    new LaserPointer(),
    new Selector()
  ];

  const colors = [
    '#000000',
    '#ff0000',
    '#ff8800',
    '#eeee00',
    '#00dd00',
    '#0088ff',
    '#ff00ff',
    '#bb00bb',
  ];

  drawingCanvas = new DrawingCanvas(canvas, tools, colors);
  log("configured DrawingCanvas");
  whiteboardUi  = new WhiteboardUI(drawingCanvas);
  log("configured Whiteboard UI");
  socketServer  = new SocketServer(whiteboardUi);
  log("configured SocketServer");

  whiteboardUi.configureStatusIndicators();
  whiteboardUi.configurePickers();
  whiteboardUi.configureLoginForm();

  onTabOpenHandlers['whiteboard'] = () => {
    let lM = currentLoginFormMode;
    lM = lM == 'register' ? 'login' : lM;
    whiteboardUi?.updateCurrentLoginMode(lM);
  };



  //Done
  if (modeStored == 'login' || modeStored == 'guest') {
    dashboardUi?.updateCurrentLoginMode(modeStored);
    whiteboardUi?.updateCurrentLoginMode(modeStored);
  }
  selectTabByParams();
};


function configureTabBar() {
  let tabBar = document.getElementsByClassName("tab-bar-view")[0] as HTMLDivElement;

  let _tabsRaw = document.getElementsByClassName("fullscreen-page-item");
  for (let i = 0; i < _tabsRaw.length; i++) {
    const id = _tabsRaw[i].id;
    tabs[id] = _tabsRaw[i] as HTMLDivElement;

    let tabBtn = document.createElement('span')
    tabBtn.classList.add('button-link');
    tabBtn.innerText = id;
    tabBtnHandlers[id] = tabBtn.onclick = () => {
      for (let id_ref of Object.keys(tabs)) {
        if (id_ref == id) {
          tabs[id_ref].classList.remove('hidden');
        } else {
          tabs[id_ref].classList.add('hidden');
        }
      }
      for (let id_ref of Object.keys(tabBtns)) {
        if (id_ref == id) {
          tabBtns[id_ref].classList.add('selected');
        } else {
          tabBtns[id_ref].classList.remove('selected');
        }
      }
      if (onTabOpenHandlers[id]) {
        onTabOpenHandlers[id]();
      }
    }

    tabBar.appendChild(tabBtn);
    tabBtns[id] = tabBtn;
  }

  const logoutBtn = document.getElementsByClassName('logout-btn')[0] as HTMLElement;
  if (logoutBtn) logoutBtn.onclick = (e) => {
    whiteboardUi?.logoutAndLeaveRoom();
    api('logout', {}, (res, status) => {
      log(status, res, getUsername());
      configureLoginForm();
      updateLoginOverlayState();
    });
  }
};

function selectTabByParams() {
  let params = new URLSearchParams(location.search);
  let param: string | null
  if (param = params.get("room-search")) {
    tabBtnHandlers['room-search']();
  } else if (param = params.get("room-join")) {
    tabBtnHandlers['whiteboard']();
    joinRoomHandler(param, false);
  } else {
    tabBtnHandlers['dashboard']();
  }
}

function configureLoginForm() {
  const overlay = document.getElementById('account-login-overlay') as HTMLElement;
  const form = document.getElementById('login-account-form') as HTMLFormElement;

  const unameField = document.getElementById('username') as HTMLInputElement;
  const pwordField = document.getElementById('password') as HTMLInputElement;
  const submitBtn = document.getElementById('login-btn') as HTMLInputElement;

  const loginModeLink1 = document.getElementById('login-account-link-1') as HTMLElement;
  const loginModeLink2 = document.getElementById('login-account-link-2') as HTMLElement;

  const error = form.getElementsByClassName('error')[0] as HTMLElement;

  submitBtn.disabled = false;
  pwordField.value = '';

  switch (currentLoginFormMode) {
    case 'login':
      pwordField.required = true;
      pwordField.classList.remove('hidden');
      loginModeLink1.innerText = 'Login as Guest...';
      loginModeLink2.innerText = 'Register an Account...';
      submitBtn.value = "Login";
      error.classList.add('hidden');
      setCookie('LCDB_LoginMode', 'login', 365);
      break;
    case 'register':
      pwordField.required = true;
      pwordField.classList.remove('hidden');
      loginModeLink1.innerText = 'Login as Guest...';
      loginModeLink2.innerText = 'Login to Existing Account...';
      submitBtn.value = "Register";
      error.classList.add('hidden');
      setCookie('LCDB_LoginMode', 'login', 365);
      break;
    case 'guest':
      pwordField.required = false;
      pwordField.classList.add('hidden');
      loginModeLink1.innerText = 'Login to Existing Account...';
      loginModeLink2.innerText = 'Register an Account...';
      submitBtn.value = "Login as Guest";
      error.classList.add('hidden');
      setCookie('LCDB_LoginMode', 'guest', 365);
      break;
  }

  loginModeLink1.onclick = (e) => {
    if (currentLoginFormMode != 'guest') {
      currentLoginFormMode = 'guest'
    } else {
      currentLoginFormMode = 'login'
    };
    configureLoginForm();
  };
  loginModeLink2.onclick = (e) => {
    if (currentLoginFormMode != 'register') {
      currentLoginFormMode = 'register'
    } else {
      currentLoginFormMode = 'login'
    }
    configureLoginForm();
  };

  form.onsubmit = (e) => {
    e.preventDefault();
    let data = new FormData(form);
    let uname = data.get('username') as string;
    let pword = data.get('password') as string;
    let creds = {username: uname, password: pword}
    if (!creds.password) delete creds.password;

    submitBtn.value = 'Loading...';
    submitBtn.disabled = true;
    api(currentLoginFormMode, creds, (data, code) => {
      log(code, data);
      if (data.success) {

        hideLoginOverlay();
        if (currentLoginFormMode == 'register') currentLoginFormMode = 'login';
        setCookie('LCDB_LoginMode', currentLoginFormMode, 365);

        dashboardUi?.updateCurrentLoginMode(currentLoginFormMode);
        whiteboardUi?.updateCurrentLoginMode(currentLoginFormMode);

        selectTabByParams();

      } else {
        submitBtn.disabled = false;
        configureLoginForm();
        error.classList.remove('hidden');
        error.innerText = 'Error: ' + data.error;
      }
    });
  };

}
function updateLoginOverlayState() {
  if (getUsername()) {
    hideLoginOverlay();
  } else {
    showLoginOverlay();
  }
}
function hideLoginOverlay() {
  const loginOverlay = document.getElementById('account-login-overlay');
  if (loginOverlay) {
    loginOverlay.style.opacity = '0';
    setTimeout(() => loginOverlay.style.display = 'none', 250);
  }
}

function showLoginOverlay() {
  const loginOverlay = document.getElementById('account-login-overlay');
  if (loginOverlay) {
    loginOverlay.style.display = 'inline-block';
    setTimeout(() => loginOverlay.style.opacity = '1', 10);
  }
}

function getUsername() {
  return getCookie('LCDB_ConnectionUser');
}

