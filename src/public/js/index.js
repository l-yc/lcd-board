'use strict';
console.clear();

function log(...args) {
  let time = new Date().toUTCString();
  console.log(`[${time}]`, '[LCD-BOARD]', ...args);
}

class SocketServer {

  constructor() {
    this.socket = io({
      autoConnect: true
    });

    this.socket.on('connect', () => {
      log('connected!');
    });

    this.socket.on('event', (event) => {
      event.isForeign = true;
      if (this.drawingTool) {
        this.drawingTool.handle(event);
      }
    });
  }

  send(event) {
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
  constructor() {
    // Create a simple drawing tool:
    let tool = new paper.Tool();

    this.tool = tool;

    // Define a mousedown and mousedrag handler
    tool.onMouseDown = this.handle.bind(this); 
    tool.onMouseDrag = this.handle.bind(this); 
  }

  handle(event) {
    log('handling', event);
    if (event.type == 'mousedown') {
      this.path = new paper.Path();
      this.path.strokeColor = 'black';
    }
    this.path.add(event.point);
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
};
