'use strict';
import io from 'socket.io-client';
import paper from 'paper';

console.clear();

function log(...args: any) {
  let time = new Date().toUTCString();
  console.log(`[${time}]`, '[LCD-BOARD]', ...args);
}

class SocketServer {
  private socket: SocketIOClient.Socket;
  public drawingTools: DrawingTool[] = [];
  private room: string | null;

  constructor() {
    this.socket = io({
      autoConnect: true
    });

    this.socket.on('connect', () => {
      log('connected!');
    });

    this.socket.on('event', (event: any) => {
      event.isForeign = true;
      if (this.drawingTools) {
        for (var tool of this.drawingTools) {
          tool.handle(event);
        }
      }
    });

    this.drawingTools = [];
    this.room = null;
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
    this.socket.emit('event', {
      type: event.type,
      point: {
        x: event.point.x,
        y: event.point.y
      },
      color: getActiveDrawingTool().getColor(),
      size: getActiveDrawingTool().getSize()
    });
  }

};

class DrawingTool {
  private tool: paper.Tool;
  private path: paper.Path | null;
  public channel: SocketServer | null;
  public color: string | null;
  public size: number | null;

  constructor(color: string | null, size: number | null) {
    // Create a simple drawing tool:
    let tool = new paper.Tool();

    this.tool = tool;

    // Define a mousedown and mousedrag handler
    tool.onMouseDown = this.handle.bind(this); 
    tool.onMouseDrag = this.handle.bind(this); 

    this.path = null;
    this.channel = null;

    this.color = color;
    this.size = size;
  }

  handle(event: any) {
    log('handling', event);
    if (event.type == 'mousedown' || this.path === null) {
      this.path = new paper.Path();
      this.path.strokeColor = new paper.Color(event.color || this.getColor());
      this.path.strokeWidth = event.size || this.getSize();
    }
    if (event.point) this.path.add(event.point);
    if (this.channel && !event.isForeign) {
      this.channel.send(event);
    }
  }

  getColor(): string {
    return this.color || globalColor;
  }
  getSize(): number {
    return this.size || globalSize;
  }

  activate() {
    this.tool.activate();
  }
};

let socketServer: SocketServer | null = null;
let drawingTools: DrawingTool[] = [];
var activeDrawingToolIndex = 0;
let globalColor: string = '#000000';
let globalSize: number = 2;

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

window.onload = () => {
  paper.setup('myCanvas');

  drawingTools = [
    new DrawingTool('#000000', null), 
    new DrawingTool('#ff0000', null), 
    new DrawingTool('#ff8800', null), 
    new DrawingTool('#eeee00', null), 
    new DrawingTool('#00dd00', null), 
    new DrawingTool('#0088ff', null),
    new DrawingTool('#ee00ee', null),
    new DrawingTool('#aa00aa', null),
  ];

  let toolPickerContainer = document.getElementById('toolPickerContainer');
  if (toolPickerContainer) {
    for (var i in drawingTools) {
      let tool = drawingTools[i];
      let button = document.createElement("button");
      if (tool.color) button.style.backgroundColor = tool.color;
      button.classList.add('colorOption');
      button.onclick = function () {
        setActiveDrawingTool(tool);
      }
      toolPickerContainer.appendChild(button);
    }
  }

  socketServer = new SocketServer();
  if (socketServer?.drawingTools) socketServer.drawingTools = drawingTools;
  for (var tool of drawingTools) tool.channel = socketServer;

  socketServer.join(prompt('Join a room:'));
};
