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

  readonly drawingCanvas: DrawingCanvas | null = null;
  constructor(canvas?: DrawingCanvas | null) {
    if (canvas) this.drawingCanvas = canvas;
  }

  updateRoomInfo(info: RoomInfo) {
    let members = document.querySelector('.room-info .members-container .members') as HTMLElement;
    if (!members) return;

    const canvas = this.drawingCanvas;
    let drawingMembers: DrawingMember[] = [];

    members.innerHTML = "";

    for (let userId in info.users) {
      if (!info.users.hasOwnProperty(userId)) return;

      if (canvas) drawingMembers.push(new DrawingMember(userId, info.users[userId]));

      let u = document.createElement('span');
      u.innerText = info.users[userId].username as string;
      members.appendChild(u);
    };

    if (canvas) canvas.setDrawingMembers(drawingMembers);
  }

  configurePickers() {
    if (!this.drawingCanvas) return;

    let toolPickerContainer = document.getElementById('tool-picker-container');
    if (toolPickerContainer) {
      for (let tool of this.drawingCanvas.getTools()) {
        tool.interceptPressureEventsOnCanvas(this.drawingCanvas.htmlCanvas);
        let button = document.createElement("button");
        button.innerText = tool.name;
        button.classList.add('toolOption');
        button.onclick = () => {
          this.drawingCanvas?.setActiveTool(tool);
        }
        toolPickerContainer.appendChild(button);
      }
    }
    let colorPickerContainer = document.getElementById('color-picker-container');
    if (colorPickerContainer) {
      for (let color of this.drawingCanvas.getColors()) {
        const button = document.createElement("button");
        button.style.backgroundColor = color;;
        button.classList.add('colorOption');
        button.onclick = () => {
          this.drawingCanvas?.setActiveColor(color)
        }
        colorPickerContainer.appendChild(button);
      }
    }
  }

  configureLoginForm() {
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

      this.drawingCanvas?.getSocketServer()?.register(uname);
      this.drawingCanvas?.getSocketServer()?.join(room);

      const loginOverlay = document.getElementById('login-overlay');
      if (loginOverlay) {
        loginOverlay.style.opacity = '0';
        setTimeout(function () {
          loginOverlay.style.display = 'none';
        }, 500);
      }
    });
  }
};

class SocketServer {
  private socket: SocketIOClient.Socket;
  private username: string | null;
  private room: string | null;

  public ui: UI | null = null;

  constructor(ui?: UI) {
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
      for (let member of this.ui?.drawingCanvas?.getDrawingMembers() || []) {
        if (member.id == drawEvent.originUserId) {
          member.handle(drawEvent);
          break;
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

    if (ui) {
      this.ui = ui;
      this.configureDrawingCanvas();
    }
  }

  configureDrawingCanvas() {
    if (this.ui?.drawingCanvas) {
      this.ui.drawingCanvas.setSocketServer(this);
    }
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
  protected tool: paper.Tool;
  protected path: paper.Path | null;
  protected pathsDrawnCount = 0;
  readonly id: string;

  public canvas: DrawingCanvas | null = null;
  public channel: SocketServer | null;

  //Drawing tool properties
  readonly name: string;
  public size: number = 2;

  public constructor(name: string, id?: string) {
    // Create a simple drawing tool:
    let tool = new paper.Tool();

    this.tool = tool;

    // Define a mousedown anousedrag handler
    tool.onMouseDown = this.handleMouseEvent.bind(this);
    tool.onMouseDrag = this.handleMouseEvent.bind(this);
    tool.onMouseUp   = this.handleMouseEvent.bind(this);

    this.name = name;
    this.id = id || (((1+Math.random())*0x10000)|0).toString(16).substring(1); //uses id or generates 8 character hex as id
    this.path = null;
    this.channel = null;
  }

  public clone(id?: string): DrawingTool {
    let newClone = new DrawingTool(this.name, id || this.id);
    newClone.size = this.size;
    return newClone;
  }

  protected handleMouseEvent(event: any) {
    log('received', event.type)
    let drawEvent = this.processMouseEventAsDrawEvent(event);
    if (drawEvent) this.handle(drawEvent);
  }

  protected processMouseEventAsDrawEvent(event: any): DrawEvent | null {
    let action: DrawEventAction;
    switch (event.type) {
      case "mousedown": action = "begin"; break;
      case "mousedrag": action = "move"; break;
      case "mouseup"  : action = "end"; break;
      default: return null;
    }
    return {
      action: action,
      timeStamp: event.timeStamp,
      point: {
        x: event.point.x,
        y: event.point.y,
      },
      toolId: this.id,
      color: this.canvas?.getActiveColor() || '#000000',
      size: this.size + (this.pressureSensitive ? (Math.min(this.size, 10) * (this.sizeAdjustmentFactor - 1)) : 0)
    };
  }

  protected pressureSensitive = false;
  public isPressureSensitive(): boolean {
    return this.pressureSensitive;
  }

  protected sizeAdjustmentFactor: number = 1;
  public interceptPressureEventsOnCanvas(canvas: HTMLElement) {
    if (canvas) {
      let pointerEventPressureHandler = (event: any) => {
        if (this.pressureSensitive && event.buttons && event.pressure) {
          this.sizeAdjustmentFactor = event.pressure + 0.5;
        }
      }

      let webkitForcePressureEventHandler = (event: any) => {
        //handles apple's proprietary force touch api
        if (this.pressureSensitive && event.webkitForce) {
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

  protected previousDrawEvent: DrawEvent | null = null;
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
      this.channel.sendDrawEvent(event, this.id + "_" + this.pathsDrawnCount);
    }
  }

  public activate() {
    this.tool.activate();
  }
};

class Pen extends DrawingTool {
  constructor(id?: string) {
    super("Pen", id || "PEN");
  }
  protected pressureSensitive = true;
}

class WeightedPenTool extends DrawingTool {

  public constructor(name: string, id?: string) {
    super(name, id);
  }

  public clone(id?: string): WeightedPenTool {
    let newClone = new WeightedPenTool(this.name, id || this.id);
    newClone.size = this.size;
    return newClone;
  }

  protected momentum: { x: number, y: number } = { x: 0, y: 0 };
  public handle(event: DrawEvent) {
    log('handling', event);

    if (this.previousDrawEvent) {
      // transform the event point first, using momentum
      // idea: calculate displacement vector, find the sum of both vectors
      //       and project the current displacement vector in the direction
      //       of the resultant vector
      let displacement = {
        x: event.point.x - this.previousDrawEvent.point.x,
        y: event.point.y - this.previousDrawEvent.point.y
      }
      let resultant = {
        x: displacement.x + this.momentum.x,
        y: displacement.y + this.momentum.y
      }
      let magnitude = Math.sqrt(resultant.x * resultant.x + resultant.y * resultant.y);
      let norm = {
        x: resultant.x / magnitude,
        y: resultant.y / magnitude
      }
      let transformed = {
        x: event.point.x * norm.x,
        y: event.point.y * norm.y
      }
      log('momentum', event.point, transformed);

      // apply the transformed point
      event.point = transformed;

      // recalculate momentum
      let dt = event.timeStamp - this.previousDrawEvent.timeStamp;
      let velocity = {
        x: displacement.x / dt,
        y: displacement.y / dt
      }
      const mass = 10.0;
      this.momentum = {
        x: velocity.x * mass,
        y: velocity.y * mass
      }
    }

    if (event.action == "end") {
      // we do some cleanup when a draw action ends
      this.path = null;
      this.previousDrawEvent = null;
      this.sizeAdjustmentFactor = 1;
      this.momentum = { x: 0, y: 0 };
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
      this.previousPreviousDrawEvent = this.previousDrawEvent;
      this.previousDrawEvent = event;
    }

    // broadcast draw event to others if required
    if (this.channel && !event.originUserId) {
      this.channel.sendDrawEvent(event, this.id + "_" + this.pathsDrawnCount);
    }
  }
};

class DrawingMember {
  readonly id: string;
  private user: User;
  private drawingTool: DrawingTool;
  private drawingTools: DrawingTool[] = [];

  constructor(id: string, user: User) {
    this.id = id;
    this.user = user;
    this.drawingTool = new DrawingTool(user.username || id, id);
  }

  configureUsingDrawingTools(tools: DrawingTool[]) {
    this.drawingTools = [];
    for (let tool of tools) {
      this.drawingTools.push(tool.clone(this.id + "_" + tool.id));
    }
  }

  getDrawingTool(toolId?: string | null) {
    if (toolId)
      for (let tool of this.drawingTools)
        if (tool.id == (this.id + "_" + toolId))
          return tool;
    return this.drawingTool;
  }

  handle(event: DrawEvent) {
    if (event.originUserId == this.id)
      this.getDrawingTool(event.toolId).handle(event)
  }
}

class DrawingCanvas {
  private drawingMembers: DrawingMember[] = [];
  private drawingTools: DrawingTool[] = [];
  private activeDrawingToolIndex = 0;

  private drawingColors: string[] = [];
  private activeColor: string = '#000000';

  readonly htmlCanvas: HTMLElement
  private socketServer: SocketServer | null = null;

  public constructor(canvas: HTMLElement, tools?: DrawingTool[], colors?: string[]) {
    this.htmlCanvas = canvas;

    if (tools) this.addTools(tools);
    if (colors) this.addColors(colors);

    if (this.drawingTools) this.drawingTools[0].activate()
  }


  public addTools(tools: DrawingTool[]) {
    for (let tool of tools) {
      tool.canvas = this;
      tool.channel = this.socketServer;
      this.drawingTools.push(tool);
    }
  }
  public addColors(colors: string[]) {
    for (let color of colors)
      if (/^#[0-9A-F]{6}$/i.test(color))
        this.drawingColors.push(color);
  }


  public getTools(): DrawingTool[] {
    return this.drawingTools;
  }
  public getColors(): string[] {
    return this.drawingColors;
  }


  public getDrawingMembers(): DrawingMember[] {
    return this.drawingMembers;
  }
  public setDrawingMembers(members: DrawingMember[]) {
    this.drawingMembers = members;
    for (let member of members) member.configureUsingDrawingTools(this.drawingTools);
  }


  public setActiveToolIndex(index: number) {
    this.setActiveTool(this.drawingTools[index]);
  }
  public setActiveTool(tool: DrawingTool) {
    tool.activate();
    let idx = this.drawingTools.indexOf(tool);
    if (idx != -1) this.activeDrawingToolIndex = idx;
  }
  public getActiveTool() {
    return this.drawingTools[this.activeDrawingToolIndex];
  }


  public setActiveColor(color: string) {
    if (/^#[0-9A-F]{6}$/i.test(color))
      this.activeColor = color;
  }
  public getActiveColor(): string {
    return this.activeColor;
  }

  public setSocketServer(sock: SocketServer) {
    this.socketServer = sock;
    for (let tool of this.drawingTools) {
      tool.channel = this.socketServer;
      console.log("set chan for " + tool.name)
    }
  }
  public getSocketServer(): SocketServer | null {
    return this.socketServer;
  }
}


window.onload = () => {
  let canvas = document.getElementById('myCanvas');
  if (!canvas) {
    log("something's terribly wrong: the canvas is missing. aborting operations.");
    return;
  }

  let tools = [
    new Pen(),
    new WeightedPenTool('WPen', 'WPEN')
  ];

  let colors = [
    '#000000',
    '#ff0000',
    '#ff8800',
    '#eeee00',
    '#00dd00',
    '#0088ff',
    '#ff00ff',
    '#bb00bb',
  ];

  paper.setup('myCanvas');
  console.log("aaa");
  let drawingCanvas = new DrawingCanvas(canvas, tools, colors);
  console.log("bbb");
  let ui            = new UI(drawingCanvas);
  console.log("ccc");
  let socketServer  = new SocketServer(ui);
  console.log("ddd");

  ui.configurePickers();
  ui.configureLoginForm();
};
