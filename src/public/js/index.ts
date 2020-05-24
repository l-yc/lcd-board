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
  public drawingTool: DrawingTool | null;
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
      if (this.drawingTool) {
        this.drawingTool.handle(event);
      }
    });

    this.drawingTool = null;
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
      }
    });
  }

};

class DrawingTool {
  private tool: paper.Tool;
  private path: paper.Path | null;
  public channel: SocketServer | null;

  constructor() {
    // Create a simple drawing tool:
    let tool = new paper.Tool();

    this.tool = tool;

    // Define a mousedown and mousedrag handler
    tool.onMouseDown = this.handle.bind(this); 
    tool.onMouseDrag = this.handle.bind(this); 

    this.path = null;
    this.channel = null;
  }

  handle(event: any) {
    log('handling', event);
    if (event.type == 'mousedown' || this.path === null) {
      this.path = new paper.Path();
      this.path.strokeColor = new paper.Color('black');
    }
    if (event.point) this.path.add(event.point);
    if (this.channel && !event.isForeign) {
      this.channel.send(event);
    }
  }
};

let socketServer = null;
let drawingTool = null;

window.onload = () => {
  paper.setup('myCanvas');

  drawingTool = new DrawingTool();
  socketServer = new SocketServer();

  socketServer.drawingTool = drawingTool;
  drawingTool.channel = socketServer;

  socketServer.join(prompt('Join a room:'));
};
