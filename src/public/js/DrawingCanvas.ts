import paper from 'paper'

import { SocketServer } from './SocketServer';
import { DrawingMember } from './DrawingMember';
import { DrawingTool } from './DrawingTool';

export class DrawingCanvas {
  private drawingMembersMap: Map<string, DrawingMember> = new Map();

  private drawingTools: DrawingTool[] = [];
  private activeDrawingToolIndex = 0;

  private drawingColors: string[] = [];
  private activeColor: string = '#000000';

  readonly htmlCanvas: HTMLElement;
  private socketServer: SocketServer | null = null;

  private paperIdToIdMap: Map<number, string> = new Map();
  private idToPaperIdMap: Map<string, number> = new Map();
  private idToPaperItemMap: Map<string, paper.Item> = new Map();

  public constructor(canvas: HTMLElement, tools?: DrawingTool[], colors?: string[]) {
    this.htmlCanvas = canvas;

    if (tools) this.addTools(tools);
    if (colors) this.addColors(colors);

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
    this.paperIdToIdMap.clear();
    this.idToPaperIdMap.clear();
    this.idToPaperItemMap.clear();
  }
  public drawJSONItem(id: string, json: string): paper.Item {
    let newI = paper.project.activeLayer.importJSON(json);
    this.replaceItemWithReferenceToId(id, newI);
    return newI;
  }
  public saveAsJSONData(): string {
    return paper.project.activeLayer.exportJSON({asString: true});
  }

  public addTools(tools: DrawingTool[]) {
    for (let tool of tools) {
      tool.canvas = this;
      tool.channel = this.socketServer;
      this.drawingTools.push(tool);
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
      member.configureUsingDrawingTools(this.drawingTools);
    }
  }

  public setReferenceToIdForPaperItem(id: string, item: paper.Item) {
    item.name = id;
    this.paperIdToIdMap.set(item.id, id);
    this.idToPaperIdMap.set(id, item.id);
    this.idToPaperItemMap.set(id, item);
  }
  public replaceItemWithReferenceToId(id: string | number, item: paper.Item) {
    if (!this.hasReferenceToId(id)) {
      if (typeof id != "number") {
        item.name = id;
        this.paperIdToIdMap.set(item.id, id);
        this.idToPaperIdMap.set(id, item.id);
        this.idToPaperItemMap.set(id, item);
        return
      }
    } else {
      if (typeof id == "number") {
        id = this.paperIdToIdMap.get(id) as string;
      }
      let t = this.idToPaperItemMap.get(id);
      if (t) {
        t.name = '';
        t.replaceWith(item);
        this.paperIdToIdMap.delete(t.id);
      }
      item.name = id;
    }
  }
  public hasReferenceToId(id: string | number): boolean {
    if (typeof id == "number") {
      return this.paperIdToIdMap.has(id);
    } else {
      return this.idToPaperIdMap.has(id);
    }
  }
  public removeItemAndReferenceToId(id: string | number) {
    let targetId: string | number | undefined;
    if (typeof id == "string" && (targetId = this.idToPaperIdMap.get(id))) {
      this.paperIdToIdMap.delete(targetId);
      this.idToPaperIdMap.delete(id);
      let item = this.idToPaperItemMap.get(id);
      if (item) {item.name = ''; item.remove();}
      this.idToPaperItemMap.delete(id);
    } else if (typeof id == "number" && (targetId = this.paperIdToIdMap.get(id))) {
      this.paperIdToIdMap.delete(id);
      this.idToPaperIdMap.delete(targetId);
      let item = this.idToPaperItemMap.get(targetId);
      if (item) {item.name = ''; item.remove();}
      this.idToPaperItemMap.delete(targetId);
    }
  }
  public getIdForPaperId(id: number): string | undefined {
    return this.paperIdToIdMap.get(id)
  }
  public getPaperIdForId(id: string): number | undefined {
    return this.idToPaperIdMap.get(id)
  }
  public getPaperItem(id: string | number): paper.Item | undefined {
    if (this.hasReferenceToId(id)) {
      if (typeof id == "number") {
        id = this.paperIdToIdMap.get(id) as string;
      }
      return this.idToPaperItemMap.get(id);
    }
    return undefined
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
