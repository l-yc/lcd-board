import paper from 'paper';

import { log, generateGUIDv4 } from './utils';

import { DrawEvent, DrawPreviewEvent, DrawEventAction, DrawPreviewEventAction, DrawData } from '../../types';

import { SocketServer } from './SocketServer';
import { DrawingCanvas } from './DrawingCanvas';

interface DrawPreviewEventProcessingResult {
    success: boolean,
    broadcast: boolean,
    makeDrawEvent: boolean,
};
interface DrawEventProcessingResult {
    success: boolean,
    broadcast: boolean,
};
class DrawingTool {
  protected tool: paper.Tool;
  readonly id: string;

  public canvas: DrawingCanvas | null = null;
  public channel: SocketServer | null;

  //Drawing tool properties
  readonly name: string;
  readonly icon: string | null;

  protected size: number = 2;
  readonly minSize: number | null = 2;
  readonly maxSize: number | null = 30;

  readonly hidden: boolean = false;

  protected color: string | null = null;

  public constructor(name: string, id?: string, icon?: string | null) {
    // Create a simple drawing tool:
    let tool = new paper.Tool();

    this.tool = tool;
    this.tool.minDistance = 1;

    // Define mouse events handlers
    tool.onMouseDown = this.handleMouseEvent.bind(this);
    tool.onMouseDrag = this.handleMouseEvent.bind(this);
    tool.onMouseUp   = this.handleMouseEvent.bind(this);

    // Define key events handlers
    tool.onKeyDown   = this.handleKeyEvent.bind(this);
    tool.onKeyUp     = this.handleKeyEvent.bind(this);

    this.name = name;
    this.id = id || (((1+Math.random())*0x10000)|0).toString(16).substring(1); //uses id or generates 8 character hex as id
    this.icon = icon || null;
    this.channel = null;
  }

  public clone(id: string): DrawingTool {
    let newClone = new DrawingTool(this.name, id || this.id);
    newClone.size = this.size;

    return newClone;
  }

  public setSize(size: number) {
    if (this.maxSize && size >= this.maxSize)
      this.size = this.maxSize;
    else if (this.minSize && size <= this.minSize)
      this.size = this.minSize;
    else
      this.size = size;
  }
  public getSize(): number {
    return this.size;
  }

  public getColor(): string {
    if (this.canvas)
      return this.canvas.getActiveColor();
    return '#000000';
  }

  protected handleMouseEvent(event: any) {
    //log({verbose: true}, 'received', event.type)
    let drawPreviewEvent = this.processMouseEventAsDrawPreviewEvent(event);
    if (drawPreviewEvent) this.handle(drawPreviewEvent);
  }

  protected handleKeyEvent(event: any) {
    //log({verbose: true}, 'received', event.type);
    let drawEvent = this.processKeyEventAsDrawEvent(event);
    if (drawEvent) this.handle(drawEvent);
  }

  protected processMouseEventAsDrawPreviewEvent(event: any): DrawPreviewEvent | null {
    let action: DrawPreviewEventAction;
    switch (event.type) {
      case "mousedown": action = "begin"; break;
      case "mousedrag": action = "move"; break;
      case "mouseup"  : action = "end"; break;
      default: return null;
    }
    return {
      kind: "preview",
      action: action,
      timeStamp: event.timeStamp,
      point: {
        x: event.point.x,
        y: event.point.y,
      },
      toolId: this.id,
      color: this.getColor(),
      size: this.getSize(),
    };
  }

  protected processKeyEventAsDrawEvent(event: any): DrawEvent | null { // override this!
    return null;
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

  protected previewPath: paper.Path | null = null;
  protected drawPreviewEventLog: DrawPreviewEvent[] = [];
  public handle(event: DrawEvent | DrawPreviewEvent) {
    if (event.toolId != this.id && this.constructor != DrawingTool) {
      let msg = 'warning: ' + this.id + ' cannot handle given event which is for ' + event.toolId;
      if (event.action == "begin" || event.kind == "draw") {
        log(msg);
      } else {
        log({verbose: true}, msg);
      }
      return;
    }
    if (event.kind == "preview") {
      //log({verbose: true}, 'handling draw preview event', event);
      if (!event.adjustedSize) {
        if (this.shouldAutoAdjustSizeToFactor()) {
          event.adjustedSize = Math.max(1,event.size + (Math.min(event.size, 30) * (this.sizeAdjustmentFactor - 1)));
        } else {
          event.adjustedSize = event.size;
        }
      }

      if (event.action == "begin") {
        // we do some setup when a draw action starts
        this.drawPreviewEventLog = [];
        this.previewPath = null;
      }

      let result = this.processDrawPreviewEvent(event);

      if (event.action == "end") {
        // we do some cleanup when a preview draw action ends
        this.sizeAdjustmentFactor = 1;
      }

      // update cached previous preview event
      this.drawPreviewEventLog.push(event);

      // broadcast preview event to others if required
      if (this.channel && !event.originUserId) {
        if (result.broadcast) {
          this.channel.sendEvent(event);
        }
        if (result.makeDrawEvent) {
          let drawEvent = this.createDrawEventFromPreviewActivity();
          this.handle(drawEvent);
        }
      }
    } else if (event.kind == "draw") {
      log({verbose: true}, this.id + ' handling draw event', event);

      //process draw event
      let result = this.processDrawEvent(event);

      //post draw event cleanup of preview path
      if (this.previewPath) this.previewPath.remove();

      //broadcast result if necessary
      if (result.broadcast && this.channel && !event.originUserId) {
        this.channel.sendEvent(event);
      }
    }
  }

  protected processDrawPreviewEvent(event: DrawPreviewEvent): DrawPreviewEventProcessingResult {

    // get properties
    let color = new paper.Color(event.color);
    let size = event.adjustedSize || event.size;

    let prevEvent = this.drawPreviewEventLog[this.drawPreviewEventLog.length - 1];
    if (prevEvent && event.point != prevEvent.point) {
      // create new path for each line segment between two draw events
      let path = this.previewPath;
      if (event.action == "move") {
        if (this.drawPreviewEventLog.length == 1 || !path) {
          //if there's only one previous event, it's a circle.
          //we'll remove it and change it to our dynamic stroke.
          let newPath = new paper.Path();
          newPath.fillColor = color;

          if (path) {
            let pos = path.position;
            path.remove();
            newPath.add(pos);
          }

          path = newPath;
        }

        //we compute the "width" of the stroke and draw it manually
        let middlePt = new paper.Point({x: (event.point.x + prevEvent.point.x)/2, y: (event.point.y + prevEvent.point.y)/2});
        let step = new paper.Point({x: event.point.x - prevEvent.point.x, y: event.point.y - prevEvent.point.y})
        step.angle += 90;
        let rescale = (size/2)/Math.sqrt(step.x*step.x + step.y*step.y)
        step.x *= rescale;
        step.y *= rescale;

        let top = middlePt.add(step);
        let bottom = middlePt.subtract(step);
        path.add(top);
        path.insert(0, bottom);

        //do some final smoothing
        path.smooth();

      } else if (event.action == "end" && this.drawPreviewEventLog.length > 1 && path) {
        // add a new point for the current location to end it off
        path.add(new paper.Point(event.point));

        //close the path up
        path.closed = true;

        //smooth it out and simplify
        path.smooth();
        path.simplify();
      }

      this.previewPath = path;

    } else {

      // configure a single circular 'dot' since there're no previous draw preview events
      let pointCircle = new paper.Path.Circle(new paper.Point(event.point), size/2);
      pointCircle.fillColor = color;
      this.tool.minDistance = size/2;
      this.previewPath = pointCircle;
    }

    return {success: true, broadcast: true, makeDrawEvent: event.action == "end"};
  }

  protected generateGUIDv4(): string {
    return generateGUIDv4();
  }
  protected getAsDrawDataList(pathList: paper.Item[]): DrawData[] {
    if (this.canvas) {
      let data: DrawData[] = [];
      for (let path of pathList) {
        let id = this.canvas.getGUIDForItem(path) || this.generateGUIDv4();
        this.canvas.setGUIDForItem(id, path);
        data.push({id: id, json: path.exportJSON({asString: true}) as string});
      }
      return data;
    }
    return [];
  }
  protected createDrawEventFromPreviewActivity(): DrawEvent {
    return {
      kind: "draw",
      action: "add",
      toolId: this.id,
      data: this.getAsDrawDataList(this.previewPath ? [this.previewPath] : [])
    }
  }

  protected processDrawEvent(event: DrawEvent): DrawEventProcessingResult {
    if (this.canvas) {
      if (this.canvas.getSocketServer()?.getDrawingLocked() !== true) {
        this.canvas.processDrawEvent(event);
      } else {
        log({verbose: true}, "warning: " + this.id + " can't perform DrawEvents as the drawing is locked remotely!")
      }
    } else {
      log("warning: " + this.id + " can't perform DrawEvents as a drawing canvas is not linked!")
    }
    return {success: true, broadcast: true}
  }

  public activate() {
    this.tool.activate();
  }
};

class Pen extends DrawingTool {
  public constructor(id?: string) {
    super("Pen", id || "PEN", "&#xf304;");
  }
  public clone(id: string): Pen {
    let newClone = new Pen(id);
    newClone.size = this.size;

    return newClone;
  }
  protected shouldAutoAdjustSizeToFactor(): boolean {
    return true;
  }
  protected processDrawPreviewEvent(event: DrawPreviewEvent): DrawPreviewEventProcessingResult {
    let path = this.previewPath;
    let color = new paper.Color(event.color);
    let size = event.adjustedSize || event.size;

    let prevEvent = this.drawPreviewEventLog[this.drawPreviewEventLog.length - 1];

    // create new path only at the start of a stroke
    if (prevEvent && event.action != 'end') {
      //remove old dot
      if (this.drawPreviewEventLog.length == 1 || !path) {
        // use the original circle as a starting point,
        // remove it and replace with a proper path
        if (path) path.remove();
        path = new paper.Path();
        path.strokeCap = 'round';
        path.strokeColor = color;
        path.strokeWidth = size;
        this.previewPath = path;

        path.add(new paper.Point(prevEvent.point));
      }
      if (prevEvent.point != event.point) {
        // add a new point for the current location if necessary
        path.add(new paper.Point(event.point));
      }

      //smoothen the path
      path.smooth();

    } else if (event.action == 'begin') {
      //draw a dot for the initial point
      let pointCircle = new paper.Path.Circle(new paper.Point(event.point), size/2);
      pointCircle.fillColor = color;
      this.previewPath = pointCircle;
    }

    return {success: true, broadcast: true, makeDrawEvent: event.action == "end"};
  }

  protected createDrawEventFromPreviewActivity(): DrawEvent {
    if (this.drawPreviewEventLog.length > 2) {
      let path = this.previewPath;
      if (path) {
        let orig = path.segments.length;
        path.simplify(0.5);
        let fina = path.segments.length;
        let per = (orig-fina) / orig * 100.0;
        log({verbose: true}, `Simplified segment count: ${orig} -> ${fina} (${per.toFixed(2)}% reduction)`);
      }
    }

    return super.createDrawEventFromPreviewActivity();
  }
}

class DynamicPen extends DrawingTool {
  public constructor(id?: string) {
    super("Dynamic Pen", id || "D_PEN", "&#xf305;");
  }
  public clone(id: string): DynamicPen {
    let newClone = new DynamicPen(id);
    newClone.size = this.size;

    return newClone;
  }
  protected pressureSensitive = true;
}

class FountainPen extends DrawingTool {
  public constructor(id?: string) {
    super("Fountain Pen", id || "F_PEN", "&#xf5ac;");
  }
  public clone(id: string): FountainPen {
    let newClone = new FountainPen(id);
    newClone.size = this.size;

    return newClone;
  }
  protected shouldAutoAdjustSizeToFactor(): boolean {
    return true;
  }
  protected processMouseEventAsDrawPreviewEvent(event: any): DrawPreviewEvent | null {
    if (this.drawPreviewEventLog.length > 0 && event.type == "mousedrag") {
      let distance = event.delta.length;

      let oldFactor = this.sizeAdjustmentFactor;
      let newFactor = 1+Math.max(-0.5, Math.min((10-distance)/10, 0.25));

      this.sizeAdjustmentFactor = Math.max(0.5, oldFactor - 0.05, Math.min(newFactor, oldFactor + 0.05, 1.5)); //Allow maximum change of 0.05
    }
    return super.processMouseEventAsDrawPreviewEvent(event);
  }
}

class LaserPointer extends DrawingTool {
  protected pointer: paper.Path.Circle | null = null;

  readonly minSize: number = 10;
  protected size: number = 20;
  readonly maxSize: number = 40;

  public constructor(id?: string) {
    super("Laser Pointer", id || "LASER", "&#xf185;");
  }

  public clone(id: string): LaserPointer {
    let newClone = new LaserPointer(id);
    newClone.size = this.size;

    return newClone;
  }

  public getColor(): string {
    return 'red';
  }

  protected processDrawPreviewEvent(event: DrawPreviewEvent): DrawPreviewEventProcessingResult {
    if (!this.pointer) {
      this.pointer = new paper.Path.Circle({
        center: event.point,
        radius: (event.adjustedSize || event.size)/2
      });
      this.pointer.fillColor = new paper.Color(this.getColor());
      this.pointer.strokeWidth = 2;
      this.pointer.strokeColor = new paper.Color('white');
    }
    switch (event.action) {
      case 'begin':
        break;
      case 'move':
        this.pointer.position = new paper.Point(event.point);
        break;
      case 'end':
        this.pointer.remove();
        this.pointer = null;
        break;
    }
    return {success: true, broadcast: true, makeDrawEvent: false};
  }
};
class Selector extends DrawingTool {
  protected selectionBox: paper.Path.Rectangle | null = null;

  public constructor(id?: string) {
    super('Selector', id || 'SELECTOR', '&#xf247;');

    paper.project.view.onMouseDown = (event: paper.MouseEvent) => {
      if (paper.project.selectedItems.length > 0) {
        paper.project.deselectAll();
      }
    };
  }

  public clone(id: string): Selector {
    let newClone = new Selector(id);

    return newClone;
  }

  public getColor(): string {
    return '#e9e9ff77';
  }

  protected processKeyEventAsDrawEvent(event: any): DrawEvent | null {
    switch (event.type) {
      case 'keydown':
        switch (event.key) {
          case 'delete':
          case 'backspace':
          return {
            kind: "draw",
            action: "delete",
            toolId: this.id,
            data: this.getAsDrawDataList(paper.project.selectedItems)
          }
        }
        break;
      case 'keyup':
        break;
    }
    return null;
  }

  protected processDrawPreviewEvent(event: DrawPreviewEvent): DrawPreviewEventProcessingResult {
    if (!this.selectionBox) {
      this.selectionBox = new paper.Path.Rectangle(
        new paper.Point(event.point),
        new paper.Size(0,0)
      );
      this.selectionBox.fillColor = new paper.Color(this.getColor());
      this.selectionBox.selected = true;
    }
    switch (event.action) {
      case 'begin':
        break;
      case 'move':
        let rect = this.selectionBox;

        //rect.segments[1].point // upper left point
        rect.segments[0].point.y = event.point.y;              // lower left point
        rect.segments[2].point.x = event.point.x;              // upper right point
        rect.segments[3].point = new paper.Point(event.point); // lower right point

        for (let item of paper.project.getItems({})) {
          if (item.intersects(this.selectionBox) &&
              this.canvas && this.canvas.hasGUIDForItem(item)) {
            item.selected = true;
          }
        }
        break;
      case 'end':
        this.selectionBox.remove();
        this.selectionBox = null;
      break;
    }
    return {success: true, broadcast: false, makeDrawEvent: false};
  };
}
class Eraser extends DrawingTool {

  protected eraserPointer: paper.Path | null = null;

  readonly minSize = 10;
  protected size = 30;
  readonly maxSize = 1000;

  public constructor(id?: string) {
    super("Eraser", id || "SNAP", '&#xf12d;');
  }
  public clone(id: string): Eraser {
    let newClone = new Eraser(id);
    newClone.size = this.size;

    return newClone;
  }

  public getColor(): string {
    return 'gray'; //dummy color
  }

  protected itemsToChange: DrawData[] = [];
  protected initialStart: boolean = true;
  protected processDrawPreviewEvent(event: DrawPreviewEvent): DrawPreviewEventProcessingResult {
    let point = event.point;
    let size = (event.adjustedSize || event.size)/2;

    if (!this.eraserPointer) {
      this.eraserPointer = new paper.Path.Circle({
        center: point,
        radius: size
      });
      let nonLocal = !!event.originUserId;
      this.eraserPointer.strokeWidth = 1;
      this.eraserPointer.strokeColor = nonLocal ? new paper.Color('#ffffff01') : new paper.Color('#aaaaaa');
      this.eraserPointer.fillColor   = nonLocal ? new paper.Color('#ffffff01') : new paper.Color('#ffffff');
    }
    switch (event.action) {
      case 'begin':
        this.eraserPointer.sendToBack();
        this.initialStart = true;
        break;
      case 'move':
        this.eraserPointer.position = new paper.Point(point);
        this.eraserPointer.sendToBack();
        break;
      case 'end':
        this.eraserPointer.remove();
        this.eraserPointer = null;
        this.initialStart = true;
        return {success: true, broadcast: false, makeDrawEvent: false};
    }

    let hitTestResult = paper.project.hitTestAll(
      new paper.Point(point),
      {
        fill: true,
        stroke: true,
        segments: true,
        tolerance: size,
        match: (x: paper.HitResult) => {
          return this.canvas && this.canvas.hasGUIDForItem(x.item) && x.item.parent instanceof paper.Layer;
        }
      }
    );

    let itemsAdded: {[id: string]: boolean} = {}
    for (let result of hitTestResult) {
      let item = result.item;
      if (!this.canvas || !item) continue;

      if (item instanceof paper.Path &&
          this.canvas.hasGUIDForItem(item)) {

        let oldPath = item as paper.Path;
        let oldId = this.canvas.getGUIDForItem(oldPath) as string;

        if (itemsAdded[oldId]) {
          log('error: duplicate name!')
          continue;
        }

        itemsAdded[oldId] = true;

        // we create a new path by subtracting the eraser pointer
        let newPath = oldPath.subtract(this.eraserPointer, {trace: oldPath.hasFill()});
        newPath.remove();
        let newPaths = this.canvas.expandItem(newPath);

        //process all new paths
        let packets: DrawData[] = [];
        let preserveOld = false;
        for (let path of newPaths) {
          let id = this.canvas.getGUIDForItem(path) || this.generateGUIDv4();
          this.canvas.setGUIDForItem(id, path);

          if (id == oldId)
            preserveOld = true;

          if (path.isEmpty())
            this.itemsToChange.push({id: id, aboveId: oldId, json: undefined});
          else
            this.itemsToChange.push({id: id, aboveId: oldId, json: path.exportJSON({asString: true}) as string});
        }

        //add to cache list of things to change
        for (let packet of packets) {
          this.itemsToChange.push(packet)
        }
        if (!preserveOld) {
          this.itemsToChange.push({id: oldId, json: undefined});
        }
      }
    }
    return {
      success: true,
      broadcast: false,
      makeDrawEvent: this.itemsToChange.length > 0
    };
  }
  protected createDrawEventFromPreviewActivity(): DrawEvent {
    let drawEvent: DrawEvent = {
      kind: "draw",
      action: "change",
      toolId: this.id,
      data: this.itemsToChange
    }
    this.itemsToChange = [];
    return drawEvent;
  }
  protected processDrawEvent(event: DrawEvent): DrawEventProcessingResult {
    if (this.canvas) {
      if (!event.originUserId) {
        //merge undo events with previous if it's not first draw action
        this.canvas.processDrawEvent(event, {mergeWithLastPastEvent: !this.initialStart});
        //subsequent draw events aren't the first action any longer
        if (this.initialStart) {
          this.initialStart = false;
        }
      } else {
        this.canvas.processDrawEvent(event);
      }
    }
    return {success: true, broadcast: true}
  }
}

export { DrawingTool, Pen, DynamicPen, FountainPen, Eraser, LaserPointer, Selector };
