import io from 'socket.io-client';

import paper from 'paper';

import { log } from './utils';

import { BoardEvent } from '../../Socket';
import { UI } from './UI';
import { DrawingTool } from './DrawingTool';

export class SocketServer {
  private socket: SocketIOClient.Socket;
  private username: string | null;
  private room: string | null;

  public ui: UI | null = null;

  constructor(ui?: UI) {
    this.socket = io({
      autoConnect: true,
      path: window.location.pathname + "socket.io"
    });

    this.socket.on('connect', () => {
      log('connected!');
      ui?.updateConnectionStatus(true);
    });

    this.socket.on('disconnect', () => {
      log('disconnected :<');
      ui?.updateConnectionStatus(false);
      ui?.performLogout({userInitiated: false});
    });

    this.socket.on('room whiteboard', (whiteboard: BoardEvent[]) => { // after joining
      log('received room whiteboard:', whiteboard);
      let deGroups: { [group: string]: DrawingTool } = {};
      let cnt = 0;
      const currentUserMemberObj = this.ui?.drawingCanvas?.getDrawingMember(this.getUserId());
      if (currentUserMemberObj) {
        paper.project.activeLayer.removeChildren();
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

    this.socket.on('board event', (boardEvent: BoardEvent) => {
      log({verbose: true}, 'received board event');
      if (boardEvent.originUserId != this.getUserId()) {
        if (boardEvent.originUserId) {
          this.ui?.drawingCanvas?.getDrawingMember(boardEvent.originUserId)?.handle(boardEvent);
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

  getGroup(event: BoardEvent, pathId: string) {
    let group: string = `${this.getUserId()}_${pathId}`; // globally unique id
    return group;
  }

  sendBoardEvent(event: BoardEvent, pathId: string) {
    if (!this.room) return; // not initialised, FIXME throw an error

    let group: string = `${this.getUserId()}_${pathId}`; // globally unique id

    event.group = group;
    event.originUserId = this.getUserId();

    log({verbose: true}, 'sending board event');
    this.socket.emit('board event', event);
  }

  getUserId() {
    return this.socket.id;
  }
};
