import SocketIO from 'socket.io';

interface User {
  username: string | null;
  room: string | null;
};

interface Room {
  users: string[];
  whiteboard: DrawDataLinkedList;
  cleanupTimeout?: ReturnType<typeof setTimeout>;
}

interface RoomInfo {
  users: { [uid: string]: User };
};

interface Whiteboard {
  drawDataList: DrawData[];
}

interface DrawDataLinkedList {
  head: DrawDataLinkedNode | null,
  tail: DrawDataLinkedNode | null,
  idToNode: { [id: string]: DrawDataLinkedNode }
}

interface DrawDataLinkedNode {
  prev: DrawDataLinkedNode | null,
  element: DrawData,
  next: DrawDataLinkedNode | null
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
  toolId: string | null,
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
 * the id parameter is a GUID for the path.
 * the aboveId parameter helps refer to setting or changing the relative z-index above another GUID.
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
 * the replaceId and json parameter are ignored by default if the action is 'delete'..
 */
interface DrawData {
  id: string,
  aboveId?: string,
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
    for (let data of event.data) {
      // creates a new element and sets the draw data.
      let node: DrawDataLinkedNode = {
        prev: null,
        element: data,
        next: null
      }
      let oldNode = room.whiteboard.idToNode[data.id];

      switch (event.action) {
        case "add":
        case "change":
        if (data.json !== undefined) {
          //insert node after the relevant previous node
          let prevNode = (data.aboveId ? room.whiteboard.idToNode[data.aboveId] : undefined) || room.whiteboard.tail;
          if (prevNode) {
            let nextNode = prevNode.next;

            node.prev = prevNode;
            node.next = nextNode;

            prevNode.next = node;

            if (nextNode) {
              nextNode.prev = node;
            } else {
              room.whiteboard.tail = node;
            }
          } else {
            room.whiteboard.head = room.whiteboard.tail = node;
          }
          //reassign reference
          room.whiteboard.idToNode[data.id] = node;

          //passthrough to deletion of old node
        } else {
          // don't do anything if we're trying to add undefined
          if (event.action == "add") break;

          // passthrough to deletion if we're "changing" to undefined
        }

        case "delete":
        if (oldNode) {
          //unlinks and removes old node
          let oldNodePrev = oldNode.prev;
          let oldNodeNext = oldNode.next;
          if (oldNodePrev) oldNodePrev.next = oldNode.next;
          if (oldNodeNext) oldNodeNext.prev = oldNode.prev;
          if (room.whiteboard.head == oldNode)
            room.whiteboard.head = oldNode.next;
          if (room.whiteboard.tail == oldNode)
            room.whiteboard.tail = oldNode.prev;

          //delete reference entirely if not replaced on previous step
          if (event.action == "delete" || data.json === undefined || data.id != oldNode.element.id) {
            delete room.whiteboard.idToNode[data.id];
          }
        }
        break;
      }
      delete data.aboveId;
    }
  }

  public getRoomWhiteboard(roomId: string): Whiteboard {
    let room: Room | undefined = this.rooms.get(roomId);
    if (!room) {
      throw 'Bad room id ' + roomId;
    }
    let whiteboard: Whiteboard = {
      drawDataList: []
    }
    let node = room.whiteboard.head;
    while (node) {
      whiteboard.drawDataList.push(node.element);
      node = node.next;
    }
    return whiteboard;
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
      if (r.users.length == 0) {
        //though this shouldn't happen, we reset the timeout timer if one exists.
        if (r.cleanupTimeout) clearTimeout(r.cleanupTimeout);

        //allow for a 5 minute buffer before cleaning up
        const userRoom = user.room;
        r.cleanupTimeout = setTimeout(() => this.deleteRoomIfEmpty(userRoom), 300000);
      }
    }

    // join
    if (room) {
      let r: Room;
      if (!this.rooms.has(room)) {
        r = { users: [], whiteboard: {head: null, tail: null, idToNode: {}} };
        this.rooms.set(room, r);
      } else {
        r = this.rooms.get(room) as Room;
      }
      r.users.push(socketId);

      this.broadcastRoomInfo(room);

      //remove room cleanup timeout if one's set as someone has joined
      if (r.cleanupTimeout) {
        clearTimeout(r.cleanupTimeout);
        delete r.cleanupTimeout;
      }
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
