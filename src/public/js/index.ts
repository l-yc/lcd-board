'use strict';
import paper from 'paper';

import { log } from './utils';
import { DrawingTool, Pen, FountainPen, WeirdPen, LaserPointer } from './DrawingTool';
import { DrawingCanvas } from './DrawingCanvas';
import { SocketServer } from './SocketServer';
import { UI } from './UI';

console.clear();

window.onload = () => {
  let canvas = document.getElementById('myCanvas');
  if (!canvas) {
    log("something's terribly wrong: the canvas is missing. aborting operations.");
    return;
  }

  let tools = [
    new Pen(),
    new FountainPen(),
    new WeirdPen('WPen', 'WPEN'),
    new LaserPointer('Laser Pointer', 'LASER_POINTER'),
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
  console.log("configured paper.js canvas");
  let drawingCanvas = new DrawingCanvas(canvas, tools, colors);
  console.log("configured DrawingCanvas");
  let ui            = new UI(drawingCanvas);
  console.log("configured UI");
  let socketServer  = new SocketServer(ui);
  console.log("configured SocketServer");

  ui.configurePickers();
  ui.configureLoginForm();
};
