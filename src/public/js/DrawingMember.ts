import { log } from './utils';

import { User, DrawEvent, DrawPreviewEvent } from '../../Socket';
import { DrawingTool } from './DrawingTool';

export class DrawingMember {
  readonly id: string;
  private user: User;
  private fallbackDrawingTool: DrawingTool;
  private drawingTools: DrawingTool[] = [];

  constructor(id: string, user: User) {
    this.id = id;
    this.user = user;
    this.fallbackDrawingTool = new DrawingTool(user.username || id, id);
  }

  configureUsingDrawingTools(tools: DrawingTool[]) {
    this.drawingTools = [];
    for (let tool of tools) {
      this.drawingTools.push(tool.clone(this.id + "_" + tool.id));
    }
  }

  getDrawingTool(toolId?: string | null) {
    if (toolId) {
      for (let tool of this.drawingTools) {
        if (tool.id == (this.id + "_" + toolId)) {
          return tool;
        }
      }
      log({verbose: true}, "warning: tool id is not found and thus the fallback tool is returned")
    }
    return this.fallbackDrawingTool;
  }

  handle(event: DrawEvent | DrawPreviewEvent) {
    if (event.originUserId == this.id) {
      let eventCopy = {...event};
      let tool = this.getDrawingTool(eventCopy.toolId);
      eventCopy.toolId = tool.id;
      tool.handle(eventCopy)
    } else {
      let msg = "warning: the event provided does not originate from the drawing member in question. not handling."
      if (event.kind == "draw") {
        log(msg);
      } else {
        log({verbose: true}, msg)
      }
    }
  }
}
