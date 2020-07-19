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
      const _ui = ui;
      const _canvas = _ui ? _ui.drawingCanvas : undefined;
      if (_ui && _canvas) {
        const currentUserMemberObj = _canvas.getDrawingMember(this.getUserId());
        if (currentUserMemberObj) {
          _canvas.clearWithAnimation(() => {

            //
            // render in chunks for every 100 items.
            // this will allow the websocket ample time to stay connected,
            // and provide a visual preview of the rendering process.
            //
            let totalItems = whiteboard.idOrder.length;
            let renderChunkSize = totalItems < 100 ? 10 : 100;
            let renderCount = 0;

            let asyncRender = (i: number) => {
              let handler = () => {
                if (i < totalItems) {
                  const id = whiteboard.idOrder[i];
                  const item = whiteboard.drawDataRef[id];
                  if (item !== undefined) {
                    _canvas.drawJSONItem(id, item.json);
                    renderCount++;
                  }
                  i++;
                  if (renderCount % renderChunkSize == 0) {
                    renderCount++;
                    asyncRender(i);
                  } else {
                    handler();
                  }
                } else {
                  setTimeout(() => {_ui.hideLoginOverlay();}, 10);
                }
              }
              setTimeout(handler, 1);
            }
            asyncRender(0);
          });
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
