import paper from 'paper';

import { log } from './utils';

import { DrawEvent, DrawPreviewEvent, DrawEventAction, DrawPreviewEventAction, DrawData } from '../../Socket';

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
    newClone.canvas = this.canvas;
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

  protected previewPathLog: paper.Path[] = [];
  protected drawPreviewEventLog: DrawPreviewEvent[] = [];
  public handle(event: DrawEvent | DrawPreviewEvent) {
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
        this.previewPathLog = [];
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
      let result = this.processDrawEvent(event);
      if (result.broadcast && this.channel && !event.originUserId) {
        this.channel.sendEvent(event);
      }
    }
  }


  protected processDrawPreviewEvent(event: DrawPreviewEvent): DrawPreviewEventProcessingResult {

    // get properties
    let color = new paper.Color(event.color);
    let size = event.adjustedSize || event.size;

    if (event.action != "begin") {
      // create new path for each line segment between two draw events
      let subpath = new paper.Path();
      subpath.strokeCap = 'round';

      // apply settings
      subpath.strokeColor = color;
      subpath.strokeWidth = size;

      // connect it with the previous stroke by adding starting point at previous stroke.
      let l = this.drawPreviewEventLog.length;
      subpath.add(new paper.Point(this.drawPreviewEventLog[l-1].point));

      // add a new point for the current location
      subpath.add(new paper.Point(event.point));

      // add to list of preview paths
      this.previewPathLog.push(subpath);
    } else {
      //reset preview path log since this is new
      this.previewPathLog = [];

      // configure a single circular point since there're no previous draw preview events
      let pointCircle = new paper.Path.Circle(new paper.Point(event.point), size/2);
      pointCircle.fillColor = color;

      // add to list of preview paths
      this.previewPathLog.push(pointCircle);
    }

    // cleanup once things end
    if (event.action == "end") {
      for (let p of this.previewPathLog) {
        p.remove();
      }
    }

    return {success: true, broadcast: true, makeDrawEvent: event.action == "end"};
  }

  protected generateGUIDv4(): string {
    let u = Date.now().toString(16) + Math.random().toString(16) + '0'.repeat(16);
    let guid = [u.substr(0,8), u.substr(8,4), '4000-8' + u.substr(13,3), u.substr(16,12)].join('-');
    return guid;
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
      data: this.getAsDrawDataList(this.previewPathLog)
    }
  }

  protected processDrawEvent(event: DrawEvent): DrawEventProcessingResult {
    if (this.canvas) {
      for (let ele of event.data) {
        this.canvas.drawJSONItem(ele.id, ele.json);
      }
    }
    return {success: true, broadcast: true}
  }

  public activate() {
    this.tool.activate();
  }
};

class JSONDrawingTool extends DrawingTool {
  readonly hidden: boolean = true;
  public constructor(id?: string) {
    super('JSON Drawing Tool', id || 'MR_JASON');

  }
  public clone(id: string): JSONDrawingTool {
    let newClone = new JSONDrawingTool(id);
    newClone.canvas = this.canvas;
    return newClone;
  }
  protected handleMouseEvent(event: any) {}
  protected handleKeyEvent(event: any) {}
  protected processDrawPreviewEvent(event: DrawPreviewEvent): DrawPreviewEventProcessingResult {
    return {success: false, broadcast: false, makeDrawEvent: false}
  }
  protected processDrawEvent(event: DrawEvent): DrawEventProcessingResult {
    if (this.canvas) {
      for (let ele of event.data) {
        this.canvas.importJSONData(ele.json);
      }
    }
    return {success: true, broadcast: true}
  }
  public drawJSON(json: string) {
    this.handle({
      kind: "draw",
      action: "add",
      toolId: this.id,
      data: [{id: this.generateGUIDv4(), json: json}],
    });
  }
  public activate() {
    log('warning: a JSONDrawingTool cannot be activated, it can only be utilised with the drawJSON method.')
  }
}
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
    newClone.canvas = this.canvas;
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

        rect.segments[0].point.y = event.point.y;              // lower left point
        //rect.segments[1].point // upper left point
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

  protected processDrawEvent(event: DrawEvent): DrawEventProcessingResult {
    if (event.action == "delete") {
      for (let drawData of event.data) {
        this.canvas?.removeItemWithGUID(drawData.id);
      }
    }
    return {success: true, broadcast: true}
  }
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
    newClone.canvas = this.canvas;
    return newClone;
  }

  public getColor(): string {
    return 'gray'; //dummy color
  }

  protected itemsToChange: DrawData[] = [];
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
        break;
      case 'move':
        this.eraserPointer.position = new paper.Point(point);
        this.eraserPointer.sendToBack();
        break;
      case 'end':
        this.eraserPointer.remove();
        this.eraserPointer = null;
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

    this.itemsToChange = [];
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
        let newPath = oldPath.subtract(this.eraserPointer, {trace: false});
        newPath.remove();
        let newPaths = this.canvas.expandItem(newPath);

        this.itemsToChange.push({id: oldId, json: null});
        for (let path of newPaths) {
          let id = this.canvas.getGUIDForItem(path) || this.generateGUIDv4();
          this.canvas.setGUIDForItem(id, path);
          path.remove();
          if (path.isEmpty())
            this.itemsToChange.push({id: id, json: undefined});
          else
            this.itemsToChange.push({id: id, json: path.exportJSON({asString: true}) as string});
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
      if (event.action == "change") {
        for (let d of event.data) {
          //overrides old path item with new path item json
          let items = this.canvas.drawJSONItem(d.id, d.json);
          for (let item of items) {
            if (item.isEmpty()) {
              this.canvas.removeItem(item);
            }
          }
        }
      }
    }
    return {success: true, broadcast: true}
  }

}

class Pen extends DrawingTool {
  public constructor(id?: string) {
    super("Pen", id || "PEN", "&#xf304;");
  }
  public clone(id: string): Pen {
    let newClone = new Pen(id);
    newClone.size = this.size;
    newClone.canvas = this.canvas;
    return newClone;
  }
  protected shouldAutoAdjustSizeToFactor(): boolean {
    return true;
  }
  protected processDrawPreviewEvent(event: DrawPreviewEvent): DrawPreviewEventProcessingResult {
    let path = this.previewPathLog[0];
    let color = new paper.Color(event.color);
    let size = event.adjustedSize || event.size;

    let prevEvent = this.drawPreviewEventLog[this.drawPreviewEventLog.length - 1];

    // create new path only at the start of a stroke
    if (event.action == 'begin' || !path) {
      path = new paper.Path();
      path.strokeCap = 'round';
      this.previewPathLog = [path];
    }

    // apply settings
    path.strokeColor = color;
    path.strokeWidth = size;

    // connect it with the previous stroke by adding starting point at previous stroke.
    if (prevEvent) {
      path.add(new paper.Point(prevEvent.point));
    }

    // add a new point for the current location
    path.add(new paper.Point(event.point));

    // cleanup once things end
    if (event.action == "end") {
      path.remove();
    }

    return {success: true, broadcast: true, makeDrawEvent: event.action == "end"};
  }

  protected createDrawEventFromPreviewActivity(): DrawEvent {
    let path = this.previewPathLog[0];
    let orig = path.segments.length;
    path.simplify();
    let fina = path.segments.length;
    let per = (orig-fina) / orig * 100.0;
    log({verbose: true}, `Simplified segment count: ${orig} -> ${fina} (${per.toFixed(2)}% reduction)`);

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
    newClone.canvas = this.canvas;
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
    newClone.canvas = this.canvas;
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
  protected size: number = 10;
  readonly maxSize: number = 40;

  public constructor(id?: string) {
    super("Laser Pointer", id || "LASER", "&#xf185;");
  }

  public clone(id: string): LaserPointer {
    let newClone = new LaserPointer(id);
    newClone.size = this.size;
    newClone.canvas = this.canvas;
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

export { DrawingTool, Pen, DynamicPen, FountainPen, Eraser, LaserPointer, Selector, JSONDrawingTool };
