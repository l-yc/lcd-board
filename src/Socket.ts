import SocketIO from 'socket.io';

interface User {
  username: string | null;
  room: string | null;
}

interface Room {
  users: string[];
}

// wrapper around SocketIO.Socket
class Socket {
  private socket: SocketIO.Socket;
  private server: SocketServer;

  private room: string | null; // FIXME some redundancy here with server, maybe should think of another way

  constructor(socket: SocketIO.Socket, server: SocketServer) {
    this.socket = socket;
    this.server = server;

    this.room = null;

    socket.on('disconnect', this.onDisconnect.bind(this));
    socket.on('register', this.onRegister.bind(this));
    socket.on('join', this.onJoin.bind(this));
    socket.on('leave', this.onLeave.bind(this));
    socket.on('draw event', this.onDrawEvent.bind(this));
  }

  private onDisconnect(): void {
    console.log('%s disconnected', this.socket.id);
  }

  private onRegister(username: string): void {
    console.log('%s registered as %s', this.socket.id, username);
    this.server.registerUser(this.socket.id, username);
  }

  private onJoin(room: string): void {
    if (this.room) {
      this.socket.leave(this.room);
    }
    console.log('%s joined %s', this.socket.id, room);
    this.socket.join(room);
    this.room = room;
    this.server.setUserRoom(this.socket.id, room);
  }

  private onLeave(): void {
    if (this.room) {
      this.socket.leave(this.room);
      this.server.setUserRoom(this.socket.id, null);
    }
  }

  private onDrawEvent(event: any): void {
    console.log('received event %o', event);
    if (!this.room) {
      // user is not subscribed to any room, don't broadcast
      console.log('invalid event: the user ' + this.socket.id + ' is not subscribed to any room!');
      return;
    } 
    this.socket.broadcast
      .to(this.room).emit('draw event', {'event' : event, 'originUserId': this.socket.id});
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

  public registerUser(socketId: string, username: string): void {
    if (!this.users.has(socketId)) {
      this.users.set(socketId, { username: null, room: null });
    }
    let user = this.users.get(socketId) as User;
    user.username = username;
  }

  public setUserRoom(socketId: string, room: string | null): void {
    let user = this.users.get(socketId) as User;

    // leave
    if (user.room) {
      let r = this.rooms.get(user.room) as Room;
      let idx = r.users.indexOf(socketId);
      r.users.splice(idx, 1);

      this.io.to(user.room).emit('room info', r.users);
    }

    // join
    if (room) {
      let r: Room;
      if (!this.rooms.has(room)) {
        r = { users: [] };
        this.rooms.set(room, r);
      } else {
         r = this.rooms.get(room) as Room;
      }
      r.users.push(socketId);

      this.io.to(room).emit('room info', r.users);
    }

    // update user
    user.room = room;
  }
};

export default SocketServer;
