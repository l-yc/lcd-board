import { log } from './utils';

import { User, DrawEvent } from '../../Socket';
import { DrawingTool } from './DrawingTool';

export class DrawingMember {
  readonly id: string;
  private user: User;
  private drawingTool: DrawingTool;
  private drawingTools: DrawingTool[] = [];

  constructor(id: string, user: User) {
    this.id = id;
    this.user = user;
    this.drawingTool = new DrawingTool(user.username || id, id);
  }

  configureUsingDrawingTools(tools: DrawingTool[]) {
    this.drawingTools = [];
    for (let tool of tools) {
      this.drawingTools.push(tool.clone(this.id + "_" + tool.id));
    }
  }

  getDrawingTool(toolId?: string | null) {
    if (toolId)
      for (let tool of this.drawingTools)
        if (tool.id == (this.id + "_" + toolId))
          return tool;
    return this.drawingTool;
  }

  handle(event: DrawEvent) {
    if (event.originUserId == this.id)
      this.getDrawingTool(event.toolId).handle(event)
  }
}
