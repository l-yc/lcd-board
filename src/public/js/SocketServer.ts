import io from 'socket.io-client';

import paper from 'paper';

import { log } from './utils';

import { Whiteboard, DrawEvent, DrawPreviewEvent } from '../../Socket';
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

    this.socket.on('room whiteboard', (whiteboard: Whiteboard) => { // after joining
      log('received room whiteboard:', whiteboard);
      let deGroups: { [group: string]: DrawingTool } = {};
      let cnt = 0;
      const currentUserMemberObj = this.ui?.drawingCanvas?.getDrawingMember(this.getUserId());
      if (currentUserMemberObj) {
        let canvas = ui?.drawingCanvas;
        if (canvas) {
          canvas.clear();
          for (let id of whiteboard.idOrder) {
            canvas.drawSVGItem(id, whiteboard.drawDataRef[id].svg);
          }
        }
      }

    });

    this.socket.on('event', (event: DrawEvent | DrawPreviewEvent) => {
      log({verbose: true}, 'received event', this);
      if (event.originUserId != this.getUserId()) {
        if (event.originUserId) {
          this.ui?.drawingCanvas?.getDrawingMember(event.originUserId)?.handle(event);
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

  sendEvent(event: DrawEvent | DrawPreviewEvent) {
    if (this.room) {
      let copy: DrawEvent | DrawPreviewEvent  = { ...event };
      copy.originUserId = this.getUserId();

      log({verbose: true}, 'sending event');
      this.socket.emit('event', copy);
    }
  }

  getUserId() {
    return this.socket.id;
  }
};
