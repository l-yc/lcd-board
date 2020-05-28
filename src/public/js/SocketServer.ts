import io from 'socket.io-client';
 
import { log } from './utils';

import { DrawEvent } from '../../Socket';
import { UI } from './UI';
import { DrawingTool } from './DrawingTool';

export class SocketServer {
  private socket: SocketIOClient.Socket;
  private username: string | null;
  private room: string | null;

  public ui: UI | null = null;

  constructor(ui?: UI) {
    this.socket = io({
      autoConnect: true
    });

    this.socket.on('connect', () => {
      log('connected!');
    });

    this.socket.on('room whiteboard', (whiteboard: DrawEvent[]) => { // after joining
      log('received room whiteboard:', whiteboard);
      let deGroups: { [group: string]: DrawingTool } = {};
      let cnt = 0;
      const currentUserMemberObj = this.ui?.drawingCanvas?.getDrawingMember(this.getUserId());

      if (currentUserMemberObj) {
        for (let drawEvent of whiteboard) {
          if (!drawEvent.group) continue;

          let tool: DrawingTool | null;
          if (!(tool = deGroups[drawEvent.group])) {
            tool = deGroups[drawEvent.group] = 
              currentUserMemberObj.getDrawingTool(drawEvent.toolId).clone(`roomInitialiserWorker${cnt}`);
            cnt += 1;
          }

          tool.handle(drawEvent);
        }
      }

    });

    this.socket.on('draw event', (drawEvent: DrawEvent) => {
      log({verbose: true}, 'received draw event');
      if (drawEvent.originUserId != this.getUserId()) {
        if (drawEvent.originUserId) {
          this.ui?.drawingCanvas?.getDrawingMember(drawEvent.originUserId)?.handle(drawEvent);
        }
      }
    });

    this.socket.on('room info', (info: any) => {
      log('received room info:', info);
      if (this.ui) {
        this.ui.updateRoomInfo(info);
      }
    });

    this.username = null;
    this.room = null;

    if (ui) {
      this.ui = ui;
      this.configureDrawingCanvas();
    }
  }

  configureDrawingCanvas() {
    if (this.ui?.drawingCanvas) {
      this.ui.drawingCanvas.setSocketServer(this);
    }
  }

  register(username: string | null) {
    if (username) {
      log("registering as", username);
      this.username = username;
      this.socket.emit('register', username);
    }
  }

  join(room: string | null) {
    if (room) {
      log("joining room", room);
      this.room = room;
      this.socket.emit('join', room);
    }
  }

  sendDrawEvent(event: DrawEvent, pathId: string) {
    if (!this.room) return; // not initialised, FIXME throw an error

    let group: string = `${this.getUserId()}_${pathId}`; // globally unique id

    event.group = group;
    event.originUserId = this.getUserId();

    log({verbose: true}, 'sending draw event');
    this.socket.emit('draw event', event);
  }

  getUserId() {
    return this.socket.id;
  }
};
