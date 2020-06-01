import paper from 'paper';

import { log } from './utils';

import { BoardEvent, DrawEvent, DrawEventAction, EditEvent, EditEventAction } from '../../Socket';

import { SocketServer } from './SocketServer';
import { DrawingCanvas } from './DrawingCanvas';

// helpers -- TODO move me to a separate file in refactor
function isDrawEvent(x: BoardEvent): x is DrawEvent {
  return (x as DrawEvent).point !== undefined;
}

class PathGroupMap {
  protected pathToGroup: Map<number,string>;
  protected groupToPath: Map<string,{ref:paper.Item}>; // not the most memory efficient, but i can't find a findItemById function, so this will do
  constructor() {
    this.pathToGroup = new Map();
    this.groupToPath = new Map();
  }

  getGroup(pathId: number): string | undefined { return this.pathToGroup.get(pathId); }
  getPathRef(groupId: string): {ref:paper.Item} | undefined { return this.groupToPath.get(groupId); }
  insert(pathRef: {ref:paper.Item}, groupId: string): void {
    this.pathToGroup.set(pathRef.ref.id, groupId);
    this.groupToPath.set(groupId, pathRef);
  }
}
let pathGroupMap: PathGroupMap = new PathGroupMap();

// drawing tools
interface BoardEventProcessingResult {success: boolean, broadcast: boolean};
class DrawingTool {
  protected tool: paper.Tool;
  protected path: paper.Path | null;
  protected drawCount = 0;
  readonly id: string;

  public canvas: DrawingCanvas | null = null;
  public channel: SocketServer | null;

  //Drawing tool properties
  readonly name: string;
  readonly icon: string | null;

  protected size: number = 2;
  readonly minSize: number | null = 2;
  readonly maxSize: number | null = 30;

  protected color: string | null = null;

  public constructor(name: string, id?: string, icon?: string | null) {
    // Create a simple drawing tool:
    let tool = new paper.Tool();

    this.tool = tool;

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
    this.path = null;
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
    log({verbose: true}, 'received', event.type)
    let boardEvent = this.processMouseEventAsBoardEvent(event);
    if (boardEvent) this.handle(boardEvent);
  }

  protected handleKeyEvent(event: any) {
    log({verbose: true}, 'received', event.type);
    let boardEvent = this.processKeyEventAsBoardEvent(event);
    if (boardEvent) this.handle(boardEvent);
  }

  protected processMouseEventAsBoardEvent(event: any): BoardEvent | null {
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
      color: this.getColor(),
      size: this.getSize(),
      persistent: true
    };
  }

  protected processKeyEventAsBoardEvent(event: any): BoardEvent | null { // override this!
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
  
  protected getCurrentDrawGroup() {
    return this.id + "_" + (this.path ? this.path.id : 0);
    //return this.id + "_" + this.drawCount;
  }

  protected previousDrawEvent: DrawEvent | null = null;
  public handle(event: BoardEvent) {
    log({verbose: true}, 'handling', event);

    if (isDrawEvent(event)) {
      if (!event.adjustedSize) {
        if (this.shouldAutoAdjustSizeToFactor()) {
          event.adjustedSize = Math.max(1,event.size + (Math.min(event.size, 30) * (this.sizeAdjustmentFactor - 1)));
        } else {
          event.adjustedSize = event.size;
        }
      }
    }

    let result = this.processBoardEvent(event);

    if (isDrawEvent(event)) {
      if (event.action == "begin") this.drawCount += 1;

      if (event.action == "end") {
        // we do some cleanup when a draw action ends
        this.previousDrawEvent = null;
        this.sizeAdjustmentFactor = 1;

      } else {
        // update cached previous draw event
        this.previousDrawEvent = event;
      }
    }

    // broadcast draw event to others if required
    if (result.broadcast && this.channel && !event.originUserId) {
      this.channel.sendBoardEvent(event, this.getCurrentDrawGroup());
    }
  }


  protected processBoardEvent(event: BoardEvent): BoardEventProcessingResult {
    if (!isDrawEvent(event)) return { success: true, broadcast: false }; // ignore edit events
    let color = new paper.Color(event.color);
    let size = event.adjustedSize || event.size;

    // create new path for each line segment between two draw events
    this.path = new paper.Path();
    this.path.strokeCap = 'round';

    // apply settings
    this.path.strokeColor = color;
    this.path.strokeWidth = size;

    // connect it with the previous stroke by adding starting point at previous stroke.
    if (this.previousDrawEvent) {
      this.path.add(new paper.Point(this.previousDrawEvent.point));
    }

    // add a new point for the current location
    this.path.add(new paper.Point(event.point));

    // cleanup once things end
    if (event.action == "end") this.path = null;

    return {success: true, broadcast: true};
  }

  public activate() {
    this.tool.activate();
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
    let newClone = new Selector(id || this.id);
    return newClone;
  }

  public getColor(): string {
    return '#e9e9ff77';
  }

  protected processKeyEventAsBoardEvent(event: any): BoardEvent | null {
    let action: EditEventAction;
    let params: any | undefined = undefined;
    switch (event.type) {
      case 'keydown':
        switch (event.key) {
          case 'delete':
          case 'backspace':
            action = 'delete';
            let groupIds: string[] = [];
            for (let item of paper.project.selectedItems) {
              let groupId = pathGroupMap.getGroup(item.id);
              if (groupId) groupIds.push(groupId); // TODO throw an error otherwise
            }
            params = groupIds;
            break;
          default: return null
        }
        break;
      case 'keyup': return null;
      default: return null;
    }
    return {
      action: action,
      timeStamp: event.timeStamp,
      params: params,
      toolId: this.id,
      persistent: true
    } as EditEvent;
  }

  protected processBoardEvent(event: BoardEvent): BoardEventProcessingResult {
    if (isDrawEvent(event)) {
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
          rect.segments[0].point.y = event.point.y;              // lower left point
          //rect.segments[1].point // upper left point
          rect.segments[2].point.x = event.point.x;              // upper right point
          rect.segments[3].point = new paper.Point(event.point); // lower right point

          for (let item of paper.project.getItems({})) {
            if (item.intersects(this.selectionBox)) {
              item.selected = true;
            }
          }
          break;
        case 'end':
          this.selectionBox.remove();
          this.selectionBox = null;
          break;
      }
      return {success: true, broadcast: false};
    } else {
      event = event as EditEvent; // BoardEvents are either DrawEvents or EditEvents
      switch (event.action) {
        case 'delete':
          for (let groupId of (event.params as string[])) {
            let pathRef = pathGroupMap.getPathRef(groupId);
            pathRef?.ref.remove();
          }
          break;
        default:
          break;
      }
      return {success: true, broadcast: true};
    }
  };
}

class Eraser extends DrawingTool {

  protected eraserPointer: paper.Path | null = null;

  readonly minSize = 10;
  protected size = 30;
  readonly maxSize = 1000;

  public constructor(id?: string) {
    super("Eraser", id || "THANOS_SNAP", '&#xf12d;');
  }
  public clone(id: string): Eraser {
    let newClone = new Eraser(id || this.id);
    newClone.size = this.size;
    return newClone;
  }

  public getColor(): string {
    return 'gray'; //dummy color
  }

  protected processBoardEvent(event: BoardEvent): BoardEventProcessingResult {
    if (!isDrawEvent(event)) return { success: true, broadcast: false }; // ignore edit events
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
        break;
      case 'move':
        this.eraserPointer.position = new paper.Point(point);
        this.eraserPointer.sendToBack();
        break;
      case 'end':
        this.eraserPointer.remove();
        this.eraserPointer = null;
        return {success: true, broadcast: true};
    }

    let hitTestResult = paper.project.hitTestAll(new paper.Point(point), {fill: true, stroke: true, segments: true, tolerance: size});
    let removedStuff = false;

    for (let result of hitTestResult) {
      if (result.item && result.item instanceof paper.Path &&
          this.eraserPointer && result.item != this.eraserPointer) {

        let oldPath = result.item as paper.Path;

        // we create a new path by subtracting the eraser pointer and inserting it into view
        let newPath = oldPath.subtract(this.eraserPointer, {insert: false, trace: false});

        if ((newPath as paper.Path).segments &&
            (newPath as paper.Path).segments.length == 0) {

          // new path is useless so don't bother
        } else {
          // insert directly above old path
          newPath.insertAbove(oldPath);
        }

        // once we're done we can remove the old path
        oldPath.remove();

        //update the flag
        removedStuff = true;
      }
    }
    return {success: true, broadcast: event.action != 'move' || removedStuff};
  }
}

class Pen extends DrawingTool {
  public constructor(id?: string) {
    super("Pen", id || "PEN", "&#xf304;");
  }
  public clone(id: string): Pen {
    let newClone = new Pen(id || this.id);
    newClone.size = this.size;
    return newClone;
  }
  protected shouldAutoAdjustSizeToFactor(): boolean {
    return true;
  }
  protected processBoardEvent(event: BoardEvent): BoardEventProcessingResult {
    if (!isDrawEvent(event)) return { success: true, broadcast: false }; // ignore edit events
    let color = new paper.Color(event.color);
    let size = event.adjustedSize || event.size;

    // create new path only at the start of a stroke
    if (event.action == 'begin' || !this.path) {
      this.path = new paper.Path();
      this.path.strokeCap = 'round';

      if (event.group) {
        pathGroupMap.insert({ref:this.path}, event.group);
      } else if (this.channel) {
        pathGroupMap.insert({ref:this.path}, this.channel.getGroup(event, this.getCurrentDrawGroup()));
      }
    }

    // apply settings
    this.path.strokeColor = color;
    this.path.strokeWidth = size;

    // connect it with the previous stroke by adding starting point at previous stroke.
    if (this.previousDrawEvent) {
      this.path.add(new paper.Point(this.previousDrawEvent.point));
    }

    // add a new point for the current location
    this.path.add(new paper.Point(event.point));
    log({verbose: true}, `Segment count: ${this.path.segments.length} (intermediate)`);

    // cleanup once things end
    if (event.action == "end") {
      let orig = this.path.segments.length;
      this.path.simplify();
      let fina = this.path.segments.length;
      let per = (orig-fina) / orig * 100.0;
      log({verbose: true}, `Segment count: ${orig} -> ${fina} (${per.toFixed(2)}% reduction)`);
      this.path = null;
    }

    return {success: true, broadcast: true};
  }
}

class DynamicPen extends DrawingTool {
  public constructor(id?: string) {
    super("Dynamic Pen", id || "D_PEN", "&#xf305;");
  }
  public clone(id: string): DynamicPen {
    let newClone = new DynamicPen(id || this.id);
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
    let newClone = new FountainPen(id || this.id);
    newClone.size = this.size;
    return newClone;
  }
  protected shouldAutoAdjustSizeToFactor(): boolean {
    return true;
  }
  protected processMouseEventAsBoardEvent(event: any): BoardEvent | null {
    if (this.previousDrawEvent && event.type == "mousedrag") {
      let distance = event.delta.length;

      let oldFactor = this.sizeAdjustmentFactor;
      let newFactor = 1+Math.max(-0.5, Math.min((10-distance)/10, 0.25));

      this.sizeAdjustmentFactor = Math.max(0.5, oldFactor - 0.05, Math.min(newFactor, oldFactor + 0.05, 1.5)); //Allow maximum change of 0.05
    }
    return super.processMouseEventAsBoardEvent(event);
  }
}

class LaserPointer extends DrawingTool {
  protected pointer: paper.Path.Circle | null = null;

  readonly minSize: number = 5;
  protected size: number = 5;
  readonly maxSize: number = 20;

  public constructor(id?: string) {
    super("Laser Pointer", id || "THE_SUN_IS_A_DEADLY_LASER", "&#xf185;");
  }

  public clone(id: string): LaserPointer {
    let newClone = new LaserPointer(id || this.id);
    newClone.size = this.size;
    return newClone;
  }

  public getColor(): string {
    return 'red';
  }

  protected processMouseEventAsBoardEvent(event: any): BoardEvent | null {
    let result = super.processMouseEventAsBoardEvent(event);
    if (result) result.persistent = false;
    return result;
  }

  protected processBoardEvent(event: BoardEvent): BoardEventProcessingResult {
    if (!isDrawEvent(event)) return { success: true, broadcast: false }; // ignore edit events
    if (!this.pointer) {
      this.pointer = new paper.Path.Circle({
        center: event.point,
        radius: this.size
      });
      this.pointer.fillColor = new paper.Color(this.getColor());
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
    return {success: true, broadcast: true};
  }
};

// supposed to be a weighted pen but it's weird, hence the name
class DrunkPen extends DrawingTool {

  public constructor(id?: string) {
    super("Drunk Pen", id || "DONT_DRINK_AND_DRIVE", "&#xf0fc;");
  }

  public clone(id: string): DrunkPen {
    let newClone = new DrunkPen(id || this.id);
    newClone.size = this.size;
    return newClone;
  }

  protected momentum: { x: number, y: number } = { x: 0, y: 0 };
  public handle(event: BoardEvent) {
    if (!isDrawEvent(event)) return; // ignore edit events
    log({verbose: true}, 'handling', event);

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
      log({verbose: true}, 'momentum', event.point, transformed);

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
      if (firstEventCall) this.drawCount += 1;

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
      this.channel.sendBoardEvent(event, this.id + "_" + this.drawCount);
    }
  }
};

export { DrawingTool, Pen, DynamicPen, FountainPen, DrunkPen, Eraser, LaserPointer, Selector };
