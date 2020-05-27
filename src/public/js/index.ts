'use strict';
import io from 'socket.io-client';
import paper from 'paper';
import { User, DrawEvent, DrawEventAction, RoomInfo } from '../../Socket';

console.clear();

function log(...args: any) {
  let time = new Date().toUTCString();
  console.log(`[${time}]`, '[LCD-BOARD]', ...args);
}

class UI {

  constructor() {}

  updateRoomInfo(info: RoomInfo) {
    let members = document.querySelector('.room-info .members-container .members') as HTMLElement;
    if (!members) return;

    drawingMembers = [];
    members.innerHTML = "";

    Object.keys(info.users).forEach((userId: string) => {
      drawingMembers.push(new DrawingMember(userId, info.users[userId]));

      let u = document.createElement('span');
      u.innerText = info.users[userId].username as string;
      members.appendChild(u);
    })
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

    this.socket.on('room whiteboard', (whiteboard: DrawEvent[]) => { // after joining
      log('received room whiteboard: %o', whiteboard);
      let dt: { [group: string]: DrawingTool } = {};
      let cnt = 0;
      for (let drawEvent of whiteboard) {
        if (!drawEvent.group) continue;

        let cur: DrawingTool;
        if (!dt[drawEvent.group]) {
          cur = new DrawingTool(`roomInitialiserWorker${cnt}`);
          dt[drawEvent.group] = cur;
        } else {
          cur = dt[drawEvent.group];
        }
        cur.handle(drawEvent);
      };
    });

    this.socket.on('draw event', (drawEvent: DrawEvent) => {
      log('received draw event');
      for (let member of drawingMembers) {
        if (member.id == drawEvent.originUserId) {
          member.handle(drawEvent);
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

  sendDrawEvent(event: DrawEvent, pathId: string) {
    if (!this.room) return; // not initialised, FIXME throw an error

    let group: string = `${this.getUserId()}_${pathId}`; // globally unique id

    event.group = group;
    event.originUserId = this.getUserId();

    log('sending draw event');
    this.socket.emit('draw event', event);
  }

  getUserId() {
    return this.socket.id;
  }
};

class DrawingTool {
  private tool: paper.Tool;
  private path: paper.Path | null;
  private pathsDrawnCount = 0;
  readonly toolId: string;

  public channel: SocketServer | null;

  //Drawing tool properties
  readonly name: string;
  public size: number = 2;

  public constructor(name: string, id: string) {
    // Create a simple drawing tool:
    let tool = new paper.Tool();

    this.tool = tool;

    // Define a mousedown anousedrag handler
    tool.onMouseDown = this.handleMouseEvent.bind(this);
    tool.onMouseDrag = this.handleMouseEvent.bind(this);
    tool.onMouseUp   = this.handleMouseEvent.bind(this);

    this.name = name;
    this.toolId = id;
    this.path = null;
    this.channel = null;
  }

  private handleMouseEvent(event: any) {
    log('received', event.type)
    let action: DrawEventAction;
    switch (event.type) {
      case "mousedown": action = "begin"; break;
      case "mousedrag": action = "move"; break;
      case "mouseup"  : action = "end"; break;
      default: return;
    }
    this.handle({
      action: action,
      point: {
        x: event.point.x,
        y: event.point.y,
      },
      color: activeColor,
      size: this.size + Math.min(this.size, 10) * (this.sizeAdjustmentFactor - 1)
    });
  }

  private sizeAdjustmentFactor: number = 1;
  public interceptPressureEventsOnCanvas(canvas: HTMLElement) {
    if (canvas) {
      let pointerEventPressureHandler = (event: any) => {
        if (event.buttons && event.pressure) {
          this.sizeAdjustmentFactor = event.pressure + 0.5;
        }
      }

      let webkitForcePressureEventHandler = (event: any) => {
        //handles apple's proprietary force touch api
        if (event.webkitForce) {
          this.sizeAdjustmentFactor = Math.min(0.5 + Math.max(0, event.webkitForce - 0.75), 1.5);
        }
      }

      let endEventHandler = (event: any) => {
        this.sizeAdjustmentFactor = 1;
      }

      canvas.addEventListener("webkitmouseforcechanged", webkitForcePressureEventHandler);
      canvas.addEventListener('pointerdown', pointerEventPressureHandler);
      canvas.addEventListener('pointermove', pointerEventPressureHandler);
      canvas.addEventListener('pointerup', endEventHandler);
    }
  }

  private previousDrawEvent: DrawEvent | null = null;
  public handle(event: DrawEvent) {
    log('handling', event);

    if (event.action == "end") {
      // we do some cleanup when a draw action ends
      this.path = null;
      this.previousDrawEvent = null;
      this.sizeAdjustmentFactor = 1;
    } else {
      // handle draw action
      // process and handle all properties
      let color = new paper.Color(event.color);
      let size = event.size;

      let firstEventCall = event.action == "begin";
      let strokePropertiesChanged = this.path != null && (this.path.strokeWidth != size || this.path.strokeColor != color);

      if (this.path == null || firstEventCall || strokePropertiesChanged) {
        this.path = new paper.Path();
        this.path.strokeCap = 'round';
      }

      // apply settings
      this.path.strokeColor = color;
      this.path.strokeWidth = size;

      // increment internal paths drawn counter for each stroke
      if (firstEventCall) this.pathsDrawnCount += 1;

      // if this stroke is just due to a property change rather than a new stroke, we connect it with the previous stroke.
      if (strokePropertiesChanged && this.previousDrawEvent) {
        this.path.add(new paper.Point(this.previousDrawEvent.point));
      }

      // we add a new point for the current location
      this.path.add(new paper.Point(event.point));
      this.previousDrawEvent = event;
    }

    // broadcast draw event to others if required
    if (this.channel && !event.originUserId) {
      this.channel.sendDrawEvent(event, this.toolId + "_" + this.pathsDrawnCount);
    }

  }

  public activate() {
    this.tool.activate();
  }
};

class DrawingMember {
  readonly id: string;
  private user: User;
  private drawingTool: DrawingTool;

  constructor(id: string, user: User) {
    this.id = id;
    this.user = user;
    this.drawingTool = new DrawingTool(user.username || id, id);
  }

  handle(event: DrawEvent) {
    if (event.originUserId == this.id)
      this.drawingTool.handle(event)
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
  let canvas = document.getElementById('myCanvas');
  if (!canvas) {
    log("something's terribly wrong: the canvas is missing. aborting operations.");
    return;
  }

  paper.setup('myCanvas');

  drawingTools = [
    new DrawingTool('Pen', 'PEN'),
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
    for (let tool of drawingTools) {
      tool.interceptPressureEventsOnCanvas(canvas);
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
    for (let color of drawingColors) {
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
