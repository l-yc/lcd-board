import socketio from 'socket.io';

class Socket {
  public io: any;

  constructor(http: any) {
    this.io = socketio(http);

    this.mountListeners();
  }

  private mountListeners(): void {
    this.io.on('connection', (socket: any) => {
      console.log('a user connected');
    });
  }
};

export default Socket;
