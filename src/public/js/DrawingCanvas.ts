import paper from 'paper'

import { log } from './utils';
import { SocketServer } from './SocketServer';
import { DrawingMember } from './DrawingMember';
import { DrawingTool, JSONDrawingTool } from './DrawingTool';

export class DrawingCanvas {
  private drawingMembersMap: Map<string, DrawingMember> = new Map();

  private drawingTools: DrawingTool[] = [];
  private hiddenDrawingTools: DrawingTool[] = [];
  private activeDrawingToolIndex = 0;

  private drawingColors: string[] = [];
  private activeColor: string = '#000000';

  readonly htmlCanvas: HTMLElement;
  private socketServer: SocketServer | null = null;

  public constructor(canvas: HTMLElement, tools?: DrawingTool[], colors?: string[]) {
    this.htmlCanvas = canvas;

    if (tools) this.addTools(tools);
    if (colors) this.addColors(colors);

    this.addTools([new JSONDrawingTool()]);

    if (this.drawingTools) this.drawingTools[0].activate();
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
    if (!json) return;
    let _jsonTool: JSONDrawingTool | null = null;
    for (let tool of this.getToolsIncludingHidden()) {
      if (tool instanceof JSONDrawingTool) {
        _jsonTool = tool;
      }
    }
    if (!_jsonTool) {
      log("JSON drawing tool not found, can't import JSON!");
      return;
    }
    const jsonTool = _jsonTool;
    jsonTool.drawJSON(json);
  }
  public exportJSONData(): string {
    return paper.project.activeLayer.exportJSON({asString: true}) as string;
  }
  public exportSVGData(): string {
    return paper.project.activeLayer.exportSVG({asString: true}) as string;
  }
  public saveJSONToDisk() {
    let a = document.createElement('a');
    let file = new Blob([this.exportJSONData()], {type: 'application/json'});
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
  }
  public loadJSONFromDisk() {
    let fileInput = document.createElement("input");
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
            let contents = e.target.result;

            //imported contents
            this.clear();
            this.importJSONData(contents);

            document.body.removeChild(fileInput)
          };
        }
        reader.readAsText(file)
      };
    };
    document.body.appendChild(fileInput);
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




  public drawJSONItem(id: string, json: string | null | undefined): paper.Item[] {
    if (!this.isGUID(id)) return [];

    this.removeItemWithGUID(id);

    if (json === undefined) {
      return [];
    }

    if (json === null) {
      let emptyPath = new paper.Path();
      emptyPath.name = id;
      return [emptyPath];
    }

    //FIXME: drawing order needs to be preserved if a previous element with said id exists.
    //to debug, try using the eraser on overlapping lines.
    //
    //let oldI = this.getItemWithGUID(id);
    //if (oldI) oldI.name = 'toBeRemoved';

    let newIs = this.expandItem(paper.project.activeLayer.importJSON(json));

    //
    /*if (oldI) {
      for (let newI of newIs) {
        newI.insertAbove(oldI);
      }
      (oldI as any).name = undefined;
      oldI.remove();
    }*/

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
  public hasItemWithGUID(id: string): boolean {
    return this.getItemWithGUID(id) != null;
  }
  public hasGUIDForItem(item: paper.Item | undefined): boolean {
    let ans = item ? this.getItemWithGUID(item.name) != null : false;
    return ans;
  }
  public removeItemWithGUID(id: string) {
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
    for (let tool of this.drawingTools) {
      tool.channel = this.socketServer;
    }
  }
  public getSocketServer(): SocketServer | null {
    return this.socketServer;
  }
}
