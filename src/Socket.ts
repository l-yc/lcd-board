import SocketIO from 'socket.io';

interface User {
  username: string | null;
  room: string | null;
};

interface Room {
  users: string[];
  whiteboard: DrawEvent[];
};

interface RoomInfo {
  users: { [uid: string]: User };
};

type DrawEventAction = "begin" | "move" | "end"
interface DrawEvent {
  group?: string,
  originUserId?: string,
  action: DrawEventAction,
  timeStamp: number,
  point: {
    x: number,
    y: number,
  },
  toolId?: string,
  color: string,
  size: number,
  adjustedSize?: number
};


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
    socket.on('draw event', this.onDrawEvent.bind(this));
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

  private onDrawEvent(event: DrawEvent): void {
    console.log('received event %o', event);
    if (!this.room) {
      // user is not subscribed to any room, don't broadcast
      console.log('invalid event: the user ' + this.socket.id + ' is not subscribed to any room!');
      return;
    } 
    this.socket.broadcast
    .to(this.room).emit('draw event', event);
    this.server.recordDrawEvent(this.socket.id, event);
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
        r = { users: [], whiteboard: [] };
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

  public recordDrawEvent(socketId: string, event: DrawEvent): void {
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
    room.whiteboard.push(event);
  }

  public getRoomWhiteboard(roomId: string): DrawEvent[] { // not ideal, cannot handle erasing
    let room: Room | undefined = this.rooms.get(roomId);
    if (!room) {
      throw 'Bad room id ' + roomId;
    }
    return room.whiteboard;
  }
};

export default SocketServer;
export { SocketServer, User, Room, RoomInfo, DrawEvent, DrawEventAction };
