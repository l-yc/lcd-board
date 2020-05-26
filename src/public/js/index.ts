'use strict';
import io from 'socket.io-client';
import paper from 'paper';

console.clear();

function log(...args: any) {
  let time = new Date().toUTCString();
  console.log(`[${time}]`, '[LCD-BOARD]', ...args);
}

class UI {

  constructor() {}

  updateRoomInfo(info: string[]) {
    let members = document.querySelector('.room-info .members-container .members') as HTMLElement;
    if (!members) { return }

    drawingMembers = [];
    members.innerHTML = ""; 

    for (let userId of info) {
      drawingMembers.push(new DrawingMember(userId));

      let u = document.createElement('span');
      u.innerText = userId;
      members.appendChild(u);
    };
  }

};

class SocketServer {
  private socket: SocketIOClient.Socket;
  public drawingTools: DrawingTool[] = [];
  private username: string | null;
  private room: string | null;

  public ui: UI | null;

  constructor() {
    this.socket = io({
      autoConnect: true
    });

    this.socket.on('connect', () => {
      log('connected!');
    });

    this.socket.on('draw event', (drawEvent: any) => {
      log('received draw event');
      for (let member of drawingMembers) {
        if (member.name == drawEvent.originUserId) {
          member.handle(drawEvent.event);
          break;
        } else {
          log('unknown member: ' + drawEvent.originUserId + ' is drawing, ignoring user')
        }
      }
    });

    this.socket.on('room info', (info: any) => {
      if (this.ui) {
        this.ui.updateRoomInfo(info);
      }
    });

    this.username = null;
    this.room = null;

    this.drawingTools = [];
    this.ui = null;
  }

  register(username: string | null) {
    this.username = username;
    this.socket.emit('register', username);
  }

  join(room: string | null) {
    this.room = room;
    this.socket.emit('join', room);
  }

  send(event: any) {
    if (!this.room) return; // not initialised, FIXME throw an error

    // We manually deconstruct the point object because paperjs
    // serializes it into Array instead of JSON for newer versions
    // See: https://github.com/paperjs/paper.js/issues/1318
    log('sending draw event');
    this.socket.emit('draw event', {
      type: event.type,
      point: {
        x: event.point.x,
        y: event.point.y
      },
      color: activeColor,
      size: getActiveDrawingTool().size
    });
  }

};

class DrawingTool {
  private tool: paper.Tool;
  private path: paper.Path | null;

  public channel: SocketServer | null;

  //Drawing tool properties
  readonly name: string;
  public size: number = 2;


  constructor(name: string) {
    // Create a simple drawing tool:
    let tool = new paper.Tool();

    this.tool = tool;

    // Define a mousedown and mousedrag handler
    tool.onMouseDown = this.handle.bind(this); 
    tool.onMouseDrag = this.handle.bind(this); 

    this.name = name;
    this.path = null;
    this.channel = null;
  }

  handle(event: any) {
    log('handling', event);
    if (event.type == 'mousedown' || this.path === null) {
      this.path = new paper.Path();
      this.path.strokeColor = new paper.Color(event.color || activeColor);
      this.path.strokeWidth = event.size || this.size;
    }
    if (event.point) this.path.add(event.point);
    if (this.channel && !event.isForeign) {
      this.channel.send(event);
    }
  }

  activate() {
    this.tool.activate();
  }
};

class DrawingMember extends DrawingTool {
  activate() {
    log("warning: activating a drawing member's drawing tool doesn't do anything");
  }
}

let ui: UI | null = null;
let socketServer: SocketServer | null = null;
let drawingMembers: DrawingMember[] = [];

let drawingTools: DrawingTool[] = [];
let activeDrawingToolIndex = 0;

let drawingColors: string[] = [];
let activeColor: string = '#000000';


function setActiveDrawingToolIndex(index: number) {
  setActiveDrawingTool(drawingTools[index]);
}
function setActiveDrawingTool(tool: DrawingTool) {
  tool.activate();
  let idx = drawingTools.indexOf(tool);
  if (idx != -1) activeDrawingToolIndex = idx;
}
function getActiveDrawingTool() {
  return drawingTools[activeDrawingToolIndex];
}

function setActiveColor(color: string) {
  activeColor = color;
}


window.onload = () => {
  paper.setup('myCanvas');

  drawingTools = [
    new DrawingTool('Pen'),
  ];

  drawingColors = [
    '#000000',
    '#ff0000',
    '#ff8800',
    '#eeee00',
    '#00dd00',
    '#0088ff',
    '#ff00ff',
    '#bb00bb',
  ];

  let toolPickerContainer = document.getElementById('tool-picker-container');
  if (toolPickerContainer) {
    for (i in drawingTools) {
      let tool = drawingTools[i];
      let button = document.createElement("button");
      button.innerText = tool.name;
      button.classList.add('toolOption');
      button.onclick = function () {
        setActiveDrawingTool(tool);
      }
      toolPickerContainer.appendChild(button);
    }
  }
  let colorPickerContainer = document.getElementById('color-picker-container');
  if (colorPickerContainer) {
    for (var i in drawingColors) {
      const color = drawingColors[i];
      const button = document.createElement("button");
      button.style.backgroundColor = color;;
      button.classList.add('colorOption');
      button.onclick = function () {
        setActiveColor(color)
      }
      colorPickerContainer.appendChild(button);
    }
  }

  ui = new UI();
  socketServer = new SocketServer();
  if (socketServer?.drawingTools) socketServer.drawingTools = drawingTools;
  for (var tool of drawingTools) tool.channel = socketServer;

  socketServer.ui = ui;

  const form = document.querySelector('#login-form') as HTMLFormElement;
  if (form) form.addEventListener('submit', (event) => {
    event.preventDefault();
    let data = new FormData(form);
    let uname = data.get('username') as string;
    let room = data.get('room') as string;
    if (!uname || !room) { 
      alert('You need to join a room with a username!'); 
      return; 
    }

    socketServer?.register(uname);
    socketServer?.join(room);

    const loginOverlay = document.getElementById('login-overlay');
    if (loginOverlay) {
      loginOverlay.style.opacity = '0';
      setTimeout(function () {
        loginOverlay.style.display = 'none';
      }, 500);
    }
  });
};
