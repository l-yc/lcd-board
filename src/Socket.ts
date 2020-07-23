import SocketIO from 'socket.io';

interface User {
  username: string | null;
  room: string | null;
};

interface Room {
  users: string[];
  whiteboard: Whiteboard;
}

interface RoomInfo {
  users: { [uid: string]: User };
};

interface Whiteboard {
  idOrder: string[];
  drawDataRef: { [id: string]: DrawData };
}




/**
 * BoardEvent is simply a representation of an event
 * that can be sent to and from the server.
 *
 * It can either be a DrawEvent or DrawPreviewEvent.
 * See the relevant docs for details.
 */
type BoardEvent = DrawEvent | DrawPreviewEvent;

/**
 * DrawEvent is a representation of a draw action.
 *
 * It describes every piece of information required to draw in the form of a list
 * of DrawData objects.
 *
 * This action refers to persistent actions, and its DrawData objects will be processed
 * and cached by the server for further redistribution should there be a need, until
 * a delete action for the corresponding DrawData is performed.
 */
interface DrawEvent {
  kind: "draw",
  originUserId?: string,
  action: DrawEventAction,
  toolId: string,
  data: DrawData[]
}
/**
 * DrawEventAction describes the action a DrawEvent should take.
 * There are three options, all of which are up to the tool in question to interpret:
 * - 'add'    : add the list of json data for the corresponding ids.
 * - 'delete' : delete the list of json data for the corresponding ids.
 * - 'change' : dynamically add, change *or* delete the list of json data for the corresponding ids.
 */
type DrawEventAction = "add" | "delete" | "change";
/**
 * DrawData contains the minimally required JSON information to be drawn.
 * It simply has a reference to an id and the json draw data.
 *
 * json parameter important notes:
 *
 * - null represents draw data with nothing, i.e. draw no content.
 * if used in conjunction with 'add'    action, an element with nothing will be added.
 * if used in conjunction with 'change' action, data will be changed to nothing.
 *
 * - undefined represents no data whatsoever, i.e. drawing information does not exist.
 * if used in conjunction with 'add'    action, nothing happens.
 * if used in conjunction with 'change' action, the 'delete' action should be performed instead.
 *
 * the json parameter should be ignored by default if the action is 'delete'
 */
interface DrawData {
  id: string,
  json: string | null | undefined
}
/**
 * DrawPreviewEvent is a representation for a draw action in a preview stage.
 * This means the draw action is not finalised yet, or is only a temporary
 * visual on the client side.
 *
 * It describes a single snapshot of the preview event via the relevant parameters.
 * The event should not be used to send drawing data, and shall be discarded by the
 * client once the 'end' action is performed or received.
 *
 * As this is primarily a client only event, the server only serves as a middleman
 * to redistribute the event to every connected user, never more than once.
 */
interface DrawPreviewEvent {
  kind: "preview",
  originUserId?: string,
  action: DrawPreviewEventAction,
  timeStamp: number,
  point: {
    x: number,
    y: number,
  },
  toolId: string,
  color: string,
  size: number,
  adjustedSize?: number,
};
/**
 * DrawPreviewEventAction describes the stage of the preview event.
 * There are three options, all of which are up to the tool in question to interpret:
 *
 * For instance:
 * - 'begin' refers to the start of a preview action,
 * - 'move'  refers to a change in the preview action,
 * - 'end'   refers to the end of the preview action.
 *
 * When the 'end' action is performed or received, all clients must discard every prior
 * event until and including the 'begin' action.
 */
type DrawPreviewEventAction = "begin" | "move" | "end";


// wrapper around SocketIO.Socket
class Socket {
  private socket: SocketIO.Socket;
  private server: SocketServer;

  private username: string | null;
  private room: string | null; // FIXME some redundancy here with server, maybe should think of another way

  constructor(socket: SocketIO.Socket, server: SocketServer) {
    this.socket = socket;
    this.server = server;

    this.username = null;
    this.room = null;

    socket.on('disconnect', this.onDisconnect.bind(this));
    socket.on('register', this.onRegister.bind(this));
    socket.on('join', this.onJoin.bind(this));
    socket.on('leave', this.onLeave.bind(this));
    socket.on('event', this.onEvent.bind(this));
  }

  private onDisconnect(): void {
    console.log('%s disconnected', this.socket.id);
    this.onLeave();
    this.server.unregisterUser(this.socket.id);
  }

  private onRegister(username: string): void {
    console.log('%s registered as %s', this.socket.id, username);
    this.username = username;
    this.server.registerUser(this.socket.id, username);
  }

  private onJoin(room: string): void {
    if (!this.username) return; // cannot join without logging in

    if (this.room) {
      this.socket.leave(this.room);
    }
    console.log('%s joined %s', this.socket.id, room);
    this.socket.join(room);
    this.room = room;
    this.server.setUserRoom(this.socket.id, room);

    this.socket.emit('room whiteboard', this.server.getRoomWhiteboard(this.room));
  }

  private onLeave(): void {
    if (this.room) {
      this.socket.leave(this.room);
      this.server.setUserRoom(this.socket.id, null);
    }
  }

  private onEvent(event: BoardEvent): void {
    console.log('received event %o', event);
    if (!this.room) {
      // user is not subscribed to any room, don't broadcast
      console.log('invalid event: the user ' + this.socket.id + ' is not subscribed to any room!');
      return;
    }
    //set the user id on server side before re-emitting to all clients
    event.originUserId = this.socket.id;

    //broadcast to room
    this.socket.broadcast.to(this.room).emit('event', event);

    //process the event if it's a DrawEvent
    if (event.kind == "draw") this.server.processDrawEvent(this.socket.id, event);
  }
};

class SocketServer {
  public io: SocketIO.Server;

  private sockets: Map<string,Socket>;
  private users: Map<string,User>;
  private rooms: Map<string,Room>;

  constructor(http: any) {
    this.io = SocketIO(http);

    this.sockets = new Map();
    this.users = new Map();
    this.rooms = new Map();

    this.mountListeners(this);
  }

  private mountListeners(data: SocketServer): void {
    this.io.on('connection', (socket: SocketIO.Socket) => {
      console.log('%s connected', socket.id);
      this.sockets.set(socket.id, new Socket(socket, this));
    });
  }

  private broadcastRoomInfo(room: string): void {
    let r = this.rooms.get(room);
    if (!r) return; // nothing to broadcast

    let users: { [uid: string]: User } = {};
    r.users?.forEach((uid: string) => {
      users[uid] = this.users.get(uid) as User // if it's null something is wrong
    });

    let roomInfo: RoomInfo = {
      users: users
    };
    this.io.to(room).emit('room info', roomInfo);
  }

  public registerUser(socketId: string, username: string): void {
    if (!this.users.has(socketId)) {
      this.users.set(socketId, { username: null, room: null });
    }
    let user = this.users.get(socketId) as User;
    user.username = username;
  }

  public unregisterUser(socketId: string): void {
    if (!this.users.has(socketId)) return; // this user is not registered!
    this.users.delete(socketId);
  }

  public processDrawEvent(socketId: string, event: DrawEvent): void {
    let user: User | undefined = this.users.get(socketId);
    if (!user) {
      console.log('unknown DrawEvent source: %s', socketId);
      return;
    }
    if (!user.room) {
      console.log('user (id %s) is not in a room!', socketId);
      return;
    }
    let room: Room | undefined = this.rooms.get(user.room);
    if (!room) {
      console.log('bad roomId', user.room);
      return;
    }

    console.log('recording draw event %o', event);
    switch (event.action) {
      case "add":
      for (let data of event.data) {
        if (data.json === undefined) continue;
        // adds a new element and sets the draw data.
        room.whiteboard.idOrder.push(data.id);
        room.whiteboard.drawDataRef[data.id] = data;
      }
      break;
      case "change":
      for (let data of event.data) {
        if (data.json === undefined) {
          // perform deletion if json is undefined.
          // idOrder param will be cleaned up later.
          delete room.whiteboard.drawDataRef[data.id]
          continue;
        }
        if (!room.whiteboard.drawDataRef[data.id]) {
          // adds a new element if necessary or requested.
          room.whiteboard.idOrder.push(data.id);
        }
        // sets or replaces the draw data for said item.
        room.whiteboard.drawDataRef[data.id] = data;
      }
      break;
      case "delete": for (let data of event.data) {
        // deletes the element in place.
        // idOrder param will be cleaned up later.
        delete room.whiteboard.drawDataRef[data.id]
      }
      break;
    }
  }

  public getRoomWhiteboard(roomId: string): Whiteboard {
    let room: Room | undefined = this.rooms.get(roomId);
    if (!room) {
      throw 'Bad room id ' + roomId;
    }
    this.doRoomWhiteboardMaintainance(roomId);
    return room.whiteboard;
  }

  public doRoomWhiteboardMaintainance(roomId: string): void {
    let room: Room | undefined = this.rooms.get(roomId);
    if (room) {
      let list = room.whiteboard.idOrder;
      let len = list.length;
      for (let i = len - 1; i >= 0; i--) {
        if (room.whiteboard.drawDataRef[list[i]] === undefined) {
          list.splice(i,1);
        }
      }
    }
  }

  public setUserRoom(socketId: string, room: string | null): void {
    let user = this.users.get(socketId) as User;

    // leave
    if (user.room) {
      let r = this.rooms.get(user.room) as Room;
      let idx = r.users.indexOf(socketId);
      r.users.splice(idx, 1);

      this.broadcastRoomInfo(user.room);

      //auto cleanup if necessary
      const userRoom = user.room;
      setTimeout(() => this.deleteRoomIfEmpty(userRoom), 60000);
    }

    // join
    if (room) {
      let r: Room;
      if (!this.rooms.has(room)) {
        r = { users: [], whiteboard: {idOrder: [], drawDataRef: {}} };
        this.rooms.set(room, r);
      } else {
        r = this.rooms.get(room) as Room;
      }
      r.users.push(socketId);

      this.broadcastRoomInfo(room);

    }

    // update user
    user.room = room;
  }

  public deleteRoomIfEmpty(room: string | null): void {
    if (room && this.rooms.get(room)?.users.length == 0) {
      console.log("cleanup: deleting room %s", room);
      this.rooms.delete(room);
    }
  }
};

export default SocketServer;
export { SocketServer, User, Room, RoomInfo, Whiteboard, BoardEvent, DrawEvent, DrawEventAction, DrawPreviewEvent, DrawPreviewEventAction, DrawData };
