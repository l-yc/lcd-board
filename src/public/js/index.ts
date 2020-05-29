'use strict';
import paper from 'paper';

import { log } from './utils';
import { DrawingTool, Pen, FountainPen, DrunkPen, Eraser, LaserPointer, Selector } from './DrawingTool';
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

  paper.setup('myCanvas');
  log("configured paper.js canvas");

  let tools = [
    new Pen(),
    new FountainPen(),
    new Eraser(),
    new LaserPointer(),
    new DrunkPen(),
    new Selector()
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

  let drawingCanvas = new DrawingCanvas(canvas, tools, colors);
  log("configured DrawingCanvas");
  let ui            = new UI(drawingCanvas);
  log("configured UI");
  let socketServer  = new SocketServer(ui);
  log("configured SocketServer");

  ui.configureStatusIndicators();
  ui.configurePickers();
  ui.configureLoginForm();
};
