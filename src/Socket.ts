import socketio from 'socket.io';

class Socket {
  public io: any;

  constructor(http: any) {
    this.io = socketio(http);

    this.mountListeners();
  }

  private mountListeners(): void {
    this.io.on('connection', (socket: any) => {
      console.log('a user connected', socket.id);

      socket.on('event', (event: any) => {
        console.log('received event %o', event);
        socket.broadcast.emit('event', event);
      });
    });
  }
};

export default Socket;
