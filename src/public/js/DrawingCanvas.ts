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

  readonly htmlCanvas: HTMLElement
  private socketServer: SocketServer | null = null;

  public constructor(canvas: HTMLElement, tools?: DrawingTool[], colors?: string[]) {
    this.htmlCanvas = canvas;

    if (tools) this.addTools(tools);
    if (colors) this.addColors(colors);

    if (this.drawingTools) this.drawingTools[0].activate()
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
      console.log("set chan for " + tool.name)
    }
  }
  public getSocketServer(): SocketServer | null {
    return this.socketServer;
  }
}
