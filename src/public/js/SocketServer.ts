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
      log('received room whiteboard: %o', whiteboard);
      let dt: { [group: string]: DrawingTool } = {};
      let cnt = 0;
      for (let drawEvent of whiteboard) {
        if (!drawEvent.group) continue;

        let cur: DrawingTool;
        if (!dt[drawEvent.group]) {
          cur = new DrawingTool(`roomInitialiserWorker${cnt}`);
          dt[drawEvent.group] = cur;
        } else {
          cur = dt[drawEvent.group];
        }
        cur.handle(drawEvent);
      };
    });

    this.socket.on('draw event', (drawEvent: DrawEvent) => {
      log('received draw event');
      if (drawEvent.originUserId != this.getUserId()) {
        for (let member of this.ui?.drawingCanvas?.getDrawingMembers() || []) {
          if (member.id == drawEvent.originUserId) {
            member.handle(drawEvent);
            break;
          }
        }
      }
    });

    this.socket.on('room info', (info: any) => {
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
    this.username = username;
    this.socket.emit('register', username);
  }

  join(room: string | null) {
    this.room = room;
    this.socket.emit('join', room);
  }

  sendDrawEvent(event: DrawEvent, pathId: string) {
    if (!this.room) return; // not initialised, FIXME throw an error

    let group: string = `${this.getUserId()}_${pathId}`; // globally unique id

    event.group = group;
    event.originUserId = this.getUserId();

    log('sending draw event');
    this.socket.emit('draw event', event);
  }

  getUserId() {
    return this.socket.id;
  }
};
