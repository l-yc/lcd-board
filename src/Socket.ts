import socketio from 'socket.io';

interface User {
  username: string | null;
  room: string | null;
}

class Socket {
  public io: any;

  private userTracker: Map<string,User>;
  private roomTracker: any;

  constructor(http: any) {
    this.io = socketio(http);

    this.userTracker = new Map();
    this.roomTracker = {};

    this.mountListeners(this);
  }

  private mountListeners(data: Socket): void {
    function leaveRoom(socket: any, room: string): void {
      socket.leave(room);
      data.userTracker.get(socket.id)!.room = null;
      let idx = data.roomTracker[room].users.indexOf(socket.id);
      data.roomTracker[room].users.splice(idx, 1);
    };

    this.io.on('connection', (socket: any) => {
      console.log('%s connected', socket.id);

      socket.on('disconnect', () => {
        console.log('%s disconnected', socket.id);
      });

      socket.on('register', (username: string) => {
        console.log('%s registered as %s', socket.id, username);
        if (!data.userTracker.has(socket.id)) {
          data.userTracker.set(socket.id, { username: null, room: null });
        }
        data.userTracker.get(socket.id)!.username = username;
      });
        
      socket.on('join', (room: string) => {
        if (!data.userTracker.has(socket.id)) return;
        console.log('%s joined %s', socket.id, room);
        socket.join(room);

        let user = <User> data.userTracker.get(socket.id);
        if (user.room) {
          leaveRoom(socket, room);
        };
        user.room = room;

        if (!data.roomTracker[room]) {
          data.roomTracker[room] = { users: [] };
        }
        data.roomTracker[room].users.push(socket.id);

        data.io.to(room).emit('room info', data.roomTracker[room].users);
      });

      socket.on('leave', () => {
        let room = <string> data.userTracker.get(socket.id)!.room;
        leaveRoom(socket, room);
        data.io.to(room).emit('room info', data.roomTracker[room].users);
      });

      socket.on('event', (event: any) => {
        console.log('received event %o', event);
        let room = data.userTracker.get(socket.id)!.room;
        if (!room) return; // user is not subscribed to any room, don't broadcast
        socket.broadcast.to(room).emit('event', event);
      });
    });
  }
};

export default Socket;
