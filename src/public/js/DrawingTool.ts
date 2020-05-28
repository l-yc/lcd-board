import paper from 'paper';

import { log } from './utils';

import { DrawEvent, DrawEventAction } from '../../Socket';

import { SocketServer } from './SocketServer';
import { DrawingCanvas } from './DrawingCanvas';

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
      delta: {
        x: event.delta.x,
        y: event.delta.y
      },
      point: {
        x: event.point.x,
        y: event.point.y,
      },
      toolId: this.id,
      color: this.canvas?.getActiveColor() || '#000000',
      size: this.size
    };
  }

  protected sizeAdjustmentFactor: number = 1;
  protected shouldAutoAdjustSizeToFactor(): boolean {
    return this.isPressureSensitive();
  }

  protected pressureSensitive = false;
  public isPressureSensitive(): boolean {
    return this.pressureSensitive;
  }
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

    if (!event.adjustedSize) {
      if (this.shouldAutoAdjustSizeToFactor()) {
        event.adjustedSize = event.size * (1 + (Math.min(event.size, 10) * (this.sizeAdjustmentFactor - 1)));
      } else {
        event.adjustedSize = event.size;
      }
    }

    if (event.action == "end") {
      // we do some cleanup when a draw action ends
      this.path = null;
      this.previousDrawEvent = null;
      this.sizeAdjustmentFactor = 1;

    } else {
      // handle draw action
      // process and handle all properties
      let color = new paper.Color(event.color);
      let size = event.adjustedSize;

      let firstEventCall = event.action == "begin";

      // create new path for each line segment between two draw events
      this.path = new paper.Path();
      this.path.strokeCap = 'round';

      // apply settings
      this.path.strokeColor = color;
      this.path.strokeWidth = size;

      // increment internal paths drawn counter for each stroke
      if (firstEventCall) this.pathsDrawnCount += 1;

      // if this stroke is just due to a property change rather than a new stroke, we connect it with the previous stroke.
      if (this.previousDrawEvent) {
        this.path.add(new paper.Point(this.previousDrawEvent.point));
      }

      // we add a new point for the current location
      this.path.add(new paper.Point(event.point));

      // update cached prev draw event
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
  public constructor(id?: string) {
    super("Pen", id || "PEN");
  }
  public clone(id?: string): Pen {
    let newClone = new Pen(id || this.id);
    newClone.size = this.size;
    return newClone;
  }
  protected pressureSensitive = true;
}

class FountainPen extends DrawingTool {
  public constructor(id?: string) {
    super("Fountain", id || "FOUNTAIN_PEN");
  }
  public clone(id?: string): FountainPen {
    let newClone = new FountainPen(id || this.id);
    newClone.size = this.size;
    return newClone;
  }
  protected shouldAutoAdjustSizeToFactor(): boolean {
    return true;
  }
  protected processMouseEventAsDrawEvent(event: any): DrawEvent | null {
    if (this.previousDrawEvent) {
      let distance = event.delta.length;

      let oldFactor = this.sizeAdjustmentFactor;
      let newFactor = 1+Math.max(-0.5, Math.min((20-distance)/20, 0.25));

      this.sizeAdjustmentFactor = Math.max(0.5, oldFactor - 0.05, Math.min(newFactor, oldFactor + 0.05, 1.5)); //Allow maximum change of 0.05
    }
    return super.processMouseEventAsDrawEvent(event);
  }
}

class LaserPointer extends DrawingTool {
  protected pointer: paper.Path.Circle | null = null;
  protected color: paper.Color = new paper.Color('red');
  public size: number = 5;

  public constructor(name: string, id?: string) {
    super(name, id);
  }

  public clone(id?: string): LaserPointer {
    let newClone = new LaserPointer(this.name, id || this.id);
    newClone.size = this.size;
    return newClone;
  }

  public handle(event: DrawEvent) {
    log('handling', event);
    switch (event.action) {
      case 'begin':
        this.pointer = new paper.Path.Circle({
          center: event.point,
          radius: this.size
        });
        this.pointer.fillColor = this.color;
        break;
      case 'move':
        log('wtf move you lil shit ', this.pointer);
        this.pointer?.translate(new paper.Point(event.delta));
        break;
      case 'end':
        this.pointer?.remove();
        this.pointer = null;
        break;
    }

    // broadcast draw event to others if required
    if (this.channel && !event.originUserId) {
      this.channel.sendDrawEvent(event, this.id + "_" + this.pathsDrawnCount);
    }
  }
};

// supposed to be a weighted pen but it's weird, hence the name
class WeirdPen extends DrawingTool {

  public constructor(name: string, id?: string) {
    super(name, id);
  }

  public clone(id?: string): WeirdPen {
    let newClone = new WeirdPen(this.name, id || this.id);
    newClone.size = this.size;
    return newClone;
  }

  protected momentum: { x: number, y: number } = { x: 0, y: 0 };
  public handle(event: DrawEvent) {
    log('handling', event);

    let eventOriginal = JSON.parse(JSON.stringify(event)); // backup a deep copy of the event to be saved

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
        x: displacement.x * norm.x,
        y: displacement.y * norm.y
      }
      log('momentum', event.point, transformed);

      // apply the transformation
      event.point.x += transformed.x;
      event.point.y += transformed.y;

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

      // update previousDrawEvent to use the raw current event
      this.previousDrawEvent = eventOriginal;
    }

    // broadcast draw event to others if required
    if (this.channel && !event.originUserId) {
      this.channel.sendDrawEvent(event, this.id + "_" + this.pathsDrawnCount);
    }
  }
};

export { DrawingTool, Pen, FountainPen, WeirdPen, LaserPointer };
