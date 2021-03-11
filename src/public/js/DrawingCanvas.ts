import paper from 'paper'

import { log, generateGUIDv4 } from './utils';
import { DrawEvent, DrawEventAction, DrawData } from '../../Socket';
import { SocketServer } from './SocketServer';
import { UI } from './UI';
import { DrawingMember } from './DrawingMember';
import { DrawingTool, Pen, DynamicPen, FountainPen, Eraser, LaserPointer, Selector } from './DrawingTool';

// A class representing the drawing canvas
export class DrawingCanvas {
  private drawingMembersMap: Map<string, DrawingMember> = new Map();

  private drawingTools: DrawingTool[] = [];
  private hiddenDrawingTools: DrawingTool[] = [];
  private genericDrawingTool: DrawingTool;
  private activeDrawingToolIndex = 0;

  private drawingColors: string[] = [];
  private activeColor: string = '#000000';

  readonly htmlCanvas: HTMLElement;
  private socketServer: SocketServer | null = null;
  private ui: UI | null = null;

  public constructor(canvas: HTMLElement, tools?: DrawingTool[], colors?: string[]) {
    this.htmlCanvas = canvas;

    if (tools) this.addTools(tools);
    if (colors) this.addColors(colors);

    this.genericDrawingTool = new DrawingTool('Basic Drawing Tool', 'BASIC');

    if (this.drawingTools) this.drawingTools[0].activate();

    this.configureKeyboardShortcuts();
  }

  public monitorKeyboardShortcuts = false;
  private keyboardShortcutHandler = (e: KeyboardEvent) => {
    if (this.monitorKeyboardShortcuts) {
      let shift = e.shiftKey ? 8 : 0;
      let ctrl  = e.ctrlKey  ? 4 : 0;
      let alt   = e.altKey   ? 2 : 0;
      let meta  = e.metaKey  ? 1 : 0;
      let mod = shift+ctrl+alt+meta;
      let keyC = e.keyCode;

      let isMacLike = /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform);

      //ctrl+z or cmd+z
      if ((mod == 4 && keyC == 90) || (isMacLike && mod == 1 && keyC == 90)) {
        e.preventDefault();
        this.undoLocalDrawEvent();
        return;
      }
      //ctrl+y or cmd+shift+z
      if ((mod == 4 && keyC == 89) || (isMacLike && mod == 9 && keyC == 90)) {
        e.preventDefault();
        this.redoLocalDrawEvent();
        return;
      }
      //ctrl+alt+s or cmd+opt+s
      //also overrides browser level ctrl+s or cmd+s
      if (((mod == 4 || mod == 6) && keyC == 83) || (isMacLike && (mod == 1 || mod == 3) && keyC == 83)) {
        e.preventDefault();
        this.saveJSONToDisk();
        return;
      }
      //shift+ctrl+alt+s or shift+cmd+opt+s
      if (((mod == 12 || mod == 14) && keyC == 83) || (isMacLike && (mod == 9 || mod == 11) && keyC == 83)) {
        e.preventDefault();
        this.saveSVGToDisk();
        return;
      }
      //ctrl+alt+o or cmd+opt+o
      if ((mod == 6 && keyC == 79) || (isMacLike && mod == 3 && keyC == 79)) {
        e.preventDefault();
        this.loadJSONFromDisk();
        return;
      }
      //ctrl+a or cmd+a
      if ((mod == 4 && keyC == 65) || (isMacLike && mod == 1 && keyC == 65)) {
        e.preventDefault();
        let selector = this.getToolsIncludingHidden().find((x) => {return x.constructor == Selector});
        if (selector) {
          this.setActiveTool(selector);
          if (this.ui) this.ui.configurePickers();
          for (let c of paper.project.activeLayer.children) {
            c.selected = true;
          }
        }
        return;
      }
      //tool and color mappings
      if (mod == 0) {
        //tools
        let target: any = null;
        switch (keyC) {
          case 80: target = Pen; break;
          case 68: target = DynamicPen; break;
          case 70: target = FountainPen; break;
          case 69: case 88: target = Eraser; break;
          case 76: target = LaserPointer; break;
          case 83: target = Selector; break;
        }
        let tool = target ? this.getToolsIncludingHidden().find((x) => {return x.constructor == target}) : undefined;
        if (tool) {
          this.setActiveTool(tool);
          if (this.ui) this.ui.configurePickers();
          return;
        }

        //colors
        let idx = (keyC - 49);
        let colors = this.getColors();
        if (idx >= 0 && idx < 9 && idx < colors.length) {
          this.setActiveColor(colors[idx]);
          if (this.ui) this.ui.configurePickers();
          return;
        }
      }
    }
  };
  public configureKeyboardShortcuts() {
    document.addEventListener('keydown', this.keyboardShortcutHandler, false);
  }

  public clearWithAnimation(completion: () => void) {
    this.htmlCanvas.style.opacity = '0';
    setTimeout(() => {
      this.clear();
      this.htmlCanvas.style.opacity = '1';

      setTimeout(() => {completion()}, 50);
    },50);

  }

  public clear() {
    paper.project.clear();
  }



  public importJSONData(json: string | null | undefined) {
    if (json) {

      log('importing json data', json);

      //we construct a draw event based off the imported data
      let event: DrawEvent = {
        kind: "draw",
        action: "add",
        toolId: null,
        data: []
      }

      for (let item of JSON.parse(json)[1]['children']) {
        let id = generateGUIDv4();
        item[1]['name'] = id;
        let drawData: DrawData = {
          id: id,
          json: JSON.stringify(item)
        }
        event.data.push(drawData);
      }

      //finally we perform the draw event and broadcast it
      log('drawing imported json data');
      this.processDrawEventAsync(event, () => {});
      this.socketServer?.sendEvent(event);
    }
  }
  public exportJSONData(): string {
    return paper.project.activeLayer.exportJSON({asString: true}) as string;
  }
  public exportSVGData(): string {
    return paper.project.activeLayer.exportSVG({asString: true}) as string;
  }
  public saveJSONToDisk() {
    log('initiated json file saving');
    let a = document.createElement('a');
    let file = new Blob([this.exportJSONData()], {type: 'application/json'});
    a.href = URL.createObjectURL(file);
    let room = this.socketServer?.getRoom()
    let date = new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString();
    if (room) {
      a.download = room + ' ' + date + '.json';
    } else {
      a.download = 'drawing ' + date + '.json';
    }
    a.click();
  }
  public saveSVGToDisk() {
    log('initiated svg file saving');
    let a = document.createElement('a');
    let file = new Blob([this.exportSVGData()], {type: 'application/json'});
    a.href = URL.createObjectURL(file);
    let room = this.socketServer?.getRoom()
    let date = new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString();
    if (room) {
      a.download = room + ' ' + date + '.svg';
    } else {
      a.download = 'drawing ' + date + '.svg';
    }
    a.click();
  }
  public loadJSONFromDisk() {
    log('initiated json file loading');
    let fileInput = document.createElement("input");
    fileInput.accept='.json'
    fileInput.type='file';
    fileInput.style.display='none';
    fileInput.onchange = (e: any) => {
      if (e.target && e.target.files) {
        var file = e.target.files[0];
        if (!file) {
          return;
        }
        var reader = new FileReader();
        reader.onload = (e: any) => {
          if (e.target) {
            //import contents
            let contents = e.target.result;
            try {
              this.importJSONData(contents);
            } catch (e) {
              window.alert("ERROR: lcd-board could not load the file correctly. Are you sure it's a valid lcd-board exported json file?");
            }

            document.body.removeChild(fileInput)
          };
        }
        reader.readAsText(file)
      };
    };
    console.log(fileInput);
    document.body.appendChild(fileInput);
    fileInput.click();
  }




  public addTools(tools: DrawingTool[]) {
    for (let tool of tools) {
      tool.canvas = this;
      tool.channel = this.socketServer;
      if (!tool.hidden)
        this.drawingTools.push(tool);
      else
        this.hiddenDrawingTools.push(tool);
    }
  }
  public addColors(colors: string[]) {
    for (let color of colors)
      if (/^#[0-9A-F]{6}$/i.test(color))
        this.drawingColors.push(color);
  }



  public getTools(): DrawingTool[] {
    return this.drawingTools;
  }
  public getToolsIncludingHidden(): DrawingTool[] {
    let a = this.drawingTools;
    let b = this.hiddenDrawingTools;
    let c: DrawingTool[] = [];
    for (let x of a) c.push(x);
    for (let x of b) c.push(x);
    c.push(this.genericDrawingTool);
    return c;
  }
  public getColors(): string[] {
    return this.drawingColors;
  }




  public getDrawingMember(id: string): DrawingMember | null {
    return this.drawingMembersMap.get(id) || null;
  }
  public getDrawingMembers(): DrawingMember[] {
    return Array.from(this.drawingMembersMap.values());
  }
  public setDrawingMembers(members: DrawingMember[]) {
    this.drawingMembersMap.clear();
    for (let member of members) {
      this.drawingMembersMap.set(member.id, member);
      member.configureUsingDrawingTools(this.getToolsIncludingHidden());
    }
  }


  private asyncRenderInProgress = false;
  private postAsyncRenderSyncQueue: [DrawEvent, any][] = [];
  public processDrawEventAsync(event: DrawEvent, completion: () => void, options?: {preservePastFutureStack?: boolean}) {
    // render in chunks for every 100 items.
    // this will allow the websocket ample time to stay connected,
    // and provide a visual preview of the rendering process.
    this.asyncRenderInProgress = true;
    let drawDataList = [...event.data];
    let totalItems = event.data.length;
    let renderChunkSize = totalItems < 50 ? 10 : 50;

    let splitDrawEvents: DrawEvent[] =[]
    while (drawDataList.length > 0) {
      splitDrawEvents.push({
        kind: "draw",
        originUserId: event.originUserId,
        action: event.action,
        toolId: event.toolId,
        data: drawDataList.splice(0, renderChunkSize)
      })
    }

    let asyncRender = (i: number) => {
      let handler = () => {
        if (i < splitDrawEvents.length) {
          this.processDrawEvent(splitDrawEvents[i], {
            preservePastFutureStack: options?.preservePastFutureStack,
            mergeWithLastPastEvent: i > 0,
            doNotWaitAsyncTask: true
          });
          asyncRender(i + 1);
        } else {
          while (this.postAsyncRenderSyncQueue.length > 0) {
            let args = this.postAsyncRenderSyncQueue.splice(0,1)[0];
            args[1].doNotWaitAsyncTask = true;
            this.processDrawEvent(args[0], args[1]);
          }
          this.asyncRenderInProgress = false;
          setTimeout(() => {completion()}, 10);
          return;
        }
      }
      setTimeout(handler, 1);
    }
    asyncRender(0);
  }

  public processDrawEvent(event: DrawEvent,
                          options?: {
                            preservePastFutureStack?: boolean,
                            mergeWithLastPastEvent?: boolean,
                            doNotWaitAsyncTask?: boolean,
                          }) {

    // if async render is in progress, wait it out unless overriden.
    if (this.asyncRenderInProgress && (!options || !options.doNotWaitAsyncTask)) {
      this.postAsyncRenderSyncQueue.push([event, options]);
      return;
    }
    // helper variables to process undo/redo
    let action = event.action;
    let changes: {[id: string] : DrawData[]} = {};
    let removes: string[] = [];
    let changePastFuture = !options || !options.preservePastFutureStack; //i.e. whether to update undo/redo history
    let mergeWithPast = options && options.mergeWithLastPastEvent; //i.e. merge with the previous draw event activity, s.t. undo performs them simultaneously.
    let orderSnippet: {action: string, ids: string[]} = {action: action, ids: []};

    if (changePastFuture && mergeWithPast) {
      orderSnippet = this.pastLocalDrawDataOrder.pop() || orderSnippet;
      if (action != orderSnippet.action) {
        orderSnippet.action = "change";
      }
    }

    // process drawevent's drawdata
    for (let ele of event.data) {

      // draw elements via json according to drawevent rules
      if (event.action == "add" && ele.json === undefined) continue;

      if (event.action != "delete") {
        this.insertJSONItem(ele.id, ele.json, ele.aboveId);
      } else {
        this.insertJSONItem(ele.id, undefined, ele.aboveId);
      }

      // note for undo/redo processing later
      if (changePastFuture) {
        if (!event.originUserId) {
          if (!changes[ele.id]) changes[ele.id] = [];
          changes[ele.id].push(ele);
        } else {
          removes.push(ele.id);
        }
      }
    }

    // process for undo/redo later
    if (changePastFuture) {
      if (!event.originUserId) {

        // add to undo history
        let ids: string[] = orderSnippet.ids;
        for (let id of Object.keys(changes)) {
          if (!this.pastLocalDrawDataRef[id]) this.pastLocalDrawDataRef[id] = [];
          this.pastLocalDrawDataRef[id].push(changes[id]);
          ids.push(id);
        }
        this.pastLocalDrawDataOrder.push({action: event.action, ids: ids});

        // cleanup undo history if necessary
        let lOrder = this.pastLocalDrawDataOrder;
        if (lOrder.length > 100) {
          let removedList = lOrder.splice(0, lOrder.length - 100);
          let idRemoveCount: {[id: string]: number} = {}
          for (let removed of removedList) {
            for (let id of removed.ids) {
              if (!idRemoveCount[id]) idRemoveCount[id] = 0;
              idRemoveCount[id]++;
            }
          }
          for (let id of Object.keys(idRemoveCount)) {
            let n = idRemoveCount[id];
            if (n - 1 > 0) {
              // only perform n-1 removals so as when the system
              // performs an undo it can can refer to the previous
              // draw action step to undo to
              this.pastLocalDrawDataRef[id].splice(0, n - 1);
            }
          }
        }

        // clear redo history after performing a drawevent
        // since we have "switched" timelines.
        this.futureLocalDrawDataRef = {};
        this.futureLocalDrawDataOrder = [];

      } else {
        for (let id of removes) {
          // we completely remove the references to ids
          // where drawevents from other origins have overriden.
          //
          // this effectively prevents any undos or redos to sections
          // where others disrupted the local undo/redo history.
          delete this.pastLocalDrawDataRef[id];
          delete this.futureLocalDrawDataRef[id];
        }
      }
    }
  }




  private pastLocalDrawDataOrder   : {action: DrawEventAction, ids: string[]}[] = []
  private futureLocalDrawDataOrder : {action: DrawEventAction, ids: string[]}[] = []
  private pastLocalDrawDataRef   : {[id: string] : DrawData[][] } = {}
  private futureLocalDrawDataRef : {[id: string] : DrawData[][] } = {}
  public canUndoLocalDrawEvent(): boolean {
    let changesToUndo = this.pastLocalDrawDataOrder[this.pastLocalDrawDataOrder.length - 1];
    if (changesToUndo) {
      for (let id of changesToUndo.ids) {
        if (!this.pastLocalDrawDataRef[id]) {
          this.pastLocalDrawDataRef = {}
          this.pastLocalDrawDataOrder = [];
          return false;
        }
      }
      return true;
    }
    return false;
  }
  public canRedoLocalDrawEvent(): boolean {
    let changesToRedo = this.futureLocalDrawDataOrder[this.futureLocalDrawDataOrder.length - 1];
    if (changesToRedo) {
      for (let id of changesToRedo.ids) {
        if (!this.futureLocalDrawDataRef[id]) {
          this.futureLocalDrawDataRef = {}
          this.futureLocalDrawDataOrder = [];
          return false;
        }
      }
      return true;
    }
    return false;
  }
  public undoLocalDrawEvent() {
    if (!this.canUndoLocalDrawEvent()) return;

    let changesToUndo = this.pastLocalDrawDataOrder.pop();
    if (changesToUndo) {
      let undoingAction = changesToUndo.action;
      let drawEvent: DrawEvent = {
        kind: "draw",
        action: undoingAction == "add" ? "delete" : (undoingAction == "delete" ? "add" : "change"),
        toolId: null,
        data: []
      }
      for (let id of changesToUndo.ids.reverse()) {
        let list = this.pastLocalDrawDataRef[id];
        let last = list ? list.pop() : undefined;
        if (!last) continue;
        let actionsReversed: DrawData[] = [...last].reverse();
        let nextLast = list[list.length-1] || [];
        actionsReversed.push(nextLast[nextLast.length-1] || {id: id});

        for (let i = 1; i < actionsReversed.length; i++) {
          let copy = {...actionsReversed[i]};
          drawEvent.data.push(copy);
        }

        if (!list) delete this.pastLocalDrawDataRef[id];

        if (!this.futureLocalDrawDataRef[id]) this.futureLocalDrawDataRef[id] = [];
        this.futureLocalDrawDataRef[id].push(last);
      }

      this.futureLocalDrawDataOrder.push(changesToUndo);
      this.processDrawEvent(drawEvent, {preservePastFutureStack: true})
      this.socketServer?.sendEvent(drawEvent);
    }
  }
  public redoLocalDrawEvent() {
    if (!this.canRedoLocalDrawEvent()) return;

    let changesToRedo = this.futureLocalDrawDataOrder.pop();
    if (changesToRedo) {
      let redoingAction = changesToRedo.action;
      let drawEvent: DrawEvent = {
        kind: "draw",
        action: redoingAction,
        toolId: null,
        data: []
      }
      for (let id of changesToRedo.ids) {
        let list = this.futureLocalDrawDataRef[id];
        let last = list ? list.pop() : undefined;
        if (!last) continue;
        let actions: DrawData[] = [...last];

        for (let i = 0; i < actions.length; i++) {
          let copy = {...actions[i]};
          drawEvent.data.push(copy);
        }

        if (!list) delete this.futureLocalDrawDataRef[id];

        if (!this.pastLocalDrawDataRef[id]) this.pastLocalDrawDataRef[id] = [];
        this.pastLocalDrawDataRef[id].push(last);
      }
      this.pastLocalDrawDataOrder.push(changesToRedo);
      this.processDrawEvent(drawEvent, {preservePastFutureStack: true});
      this.socketServer?.sendEvent(drawEvent);
    }
  }




  public insertJSONItem(id: string, json: string | null | undefined, aboveId?: string): paper.Item[] {
    if (!this.isGUID(id)) return [];

    if (json === undefined) {
      this.removeItemWithGUID(id);
      return [];
    }

    let oldI    = this.getItemWithGUID(id);
    let bottomI = this.getItemWithGUID(aboveId);
    let prevI = bottomI || oldI;

    let newIs = json === null ? [new paper.Path()] : this.expandItem(paper.project.activeLayer.importJSON(json));

    if (prevI != null) {
      for (let item of newIs) {
        this.setGUIDForItem(item.name, item);
        item.insertAbove(prevI);
        prevI = item;
      }
    }
    if (oldI) {
      (oldI as any).name = undefined;
      oldI.remove();
    }
    if (newIs.length == 1) {
      newIs[0].name = id;
    }

    return newIs;
  }
  public expandItem(item: paper.Item): paper.Item[] {
    let list: paper.Item[] = []
    let parent = item.parent;
    if (item.children) {
      for (let o of [...item.children]) {
        this.expandItem(o);
      }
      for (let o of [...item.children]) {
        list.push(o);
        o.remove();
        if (parent) {
          parent.addChild(o);
          o.insertAbove(item);
        }
        if (o instanceof paper.Path && item instanceof paper.CompoundPath) {
          let par = (item as paper.CompoundPath);
          let chi = (o as paper.Path);
          chi.fillColor = par.fillColor;
          chi.strokeColor = par.strokeColor;
        }
      }
      item.remove();
    } else {
      list = [item];
    }
    return list;
  }
  public isGUID(id: string | undefined): boolean {
    return id ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) : false;
  }
  public setGUIDForItem(id: string, item: paper.Item): boolean {
    return this.replaceGUIDWithItem(id, item);
  }
  public getGUIDForItem(item: paper.Item): string | undefined {
    return this.isGUID(item.name) ? item.name : undefined;
  }
  public getItemWithGUID(id: string | undefined): paper.Item | undefined {
    if (!id || !this.isGUID(id)) return undefined;
    return (paper.project.activeLayer.children as any)[id];
  }
  public replaceGUIDWithItem(id: string, item: paper.Item): boolean {
    if (!this.isGUID(id)) return false;
    if (this.hasItemWithGUID(id)) {
      let t = this.getItemWithGUID(id);
      if (t && t != item) {
        if (t.parent) {
          item.remove();
          t.parent.addChild(item);
        }
        item.insertAbove(t);
        t.remove();
        (t as any).name = undefined;
      }
    }
    item.name = id;
    return true;
  }
  public hasItemWithGUID(id: string | undefined): boolean {
    return this.getItemWithGUID(id) != null;
  }
  public hasGUIDForItem(item: paper.Item | undefined): boolean {
    let ans = item ? this.getItemWithGUID(item.name) != null : false;
    return ans;
  }
  public removeItemWithGUID(id: string | undefined) {
    this.removeItem(this.getItemWithGUID(id))
  }
  public removeItem(item: paper.Item | undefined) {
    if (item) {
      (item as any).name = undefined;
      item.remove();
    }
  }


  public setActiveToolIndex(index: number) {
    this.setActiveTool(this.drawingTools[index]);
  }
  public setActiveTool(tool: DrawingTool) {
    tool.activate();
    let idx = this.drawingTools.indexOf(tool);
    if (idx != -1) this.activeDrawingToolIndex = idx;
  }
  public getActiveTool() {
    return this.drawingTools[this.activeDrawingToolIndex];
  }


  public setActiveColor(color: string) {
    if (/^#[0-9A-F]{6}$/i.test(color))
      this.activeColor = color;
  }
  public getActiveColor(): string {
    return this.activeColor;
  }




  public setSocketServer(sock: SocketServer) {
    this.socketServer = sock;
    for (let tool of this.getToolsIncludingHidden()) {
      tool.channel = this.socketServer;
    }
  }
  public getSocketServer(): SocketServer | null {
    return this.socketServer;
  }

  public setUI(ui: UI) {
    this.ui = ui;
  }
  public getUI(ui: UI | null) {
    return this.ui;
  }
}
