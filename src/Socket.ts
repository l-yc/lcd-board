import socketio from 'socket.io';

class Socket {
  public io: any;

  private userTracker: any;
  private roomTracker: any;

  constructor(http: any) {
    this.io = socketio(http);

    this.userTracker = {};
    this.roomTracker = {};

    this.mountListeners(this);
  }

  private mountListeners(data: Socket): void {
    this.io.on('connection', (socket: any) => {
      console.log('%s connected', socket.id);

      socket.on('disconnect', () => {
        console.log('%s disconnected', socket.id);
      });

      socket.on('join', (room: string) => {
        socket.join(room);
        if (!data.userTracker[socket.id]) {
          data.userTracker[socket.id] = {};
        }
        data.userTracker[socket.id].room = room;
        if (!data.roomTracker[room]) {
          data.roomTracker[room] = { users: [] };
        }
        data.roomTracker[room].users.push(socket.id);
      });

      socket.on('leave', () => {
        let room = data.userTracker[socket.id].room;
        socket.leave(room);
        delete data.userTracker[socket.id].room;
        let idx = data.roomTracker[room].users.indexOf(socket.id);
        data.roomTracker[room].users.splice(idx, 1);
      });

      socket.on('event', (event: any) => {
        console.log('received event %o', event);
        let room = data.userTracker[socket.id].room;
        if (!room) return; // user is not subscribed to any room, don't broadcast
        socket.broadcast.to(room).emit('event', event);
      });
    });
  }
};

export default Socket;
