'use strict';
console.clear();

let socket = io({
  autoConnect: true
});

socket.on('connect', () => {
  log('connected!');
});

function log(...args) {
  let time = new Date().toUTCString();
  console.log(`[${time}]`, '[LCD-BOARD]', ...args);
}

class DrawingTool {
  constructor() {
    // Create a simple drawing tool:
    let tool = new paper.Tool();
    let path;

    this.tool = tool;

    // Define a mousedown and mousedrag handler
    tool.onMouseDown = function(event) {
      path = new paper.Path();
      path.strokeColor = 'black';
      path.add(event.point);
    }

    tool.onMouseDrag = function(event) {
      path.add(event.point);
    }
  }
};

let drawingTool = null;

window.onload = () => {
  paper.setup('myCanvas');

  drawingTool = new DrawingTool();
};
