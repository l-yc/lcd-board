

interface Room {
  users: string[];
  whiteboard: { [name: string]: { locked: boolean, filename: string, data: DrawDataLinkedList } };
}

interface RoomInfo {
  id: string;
  displayName: string;
  users: string[];
  owner: string;
  isPublic: boolean;
  isActive: boolean;
  isPersistent?: boolean;
  popularity?: number;
  whiteboards: {name: string, locked: boolean}[];
};

interface Whiteboard {
  roomId: string;
  name: string;
  locked: boolean;
  filename?: string;
  drawDataList: DrawData[];
}


interface LegacyUser {
  username: string | null;
  room: string | null;
};

interface LegacyRoom {
  users: string[];
  whiteboard: DrawDataLinkedList;
  locked: boolean;
  saveFunc?: () => void;
  cleanupTimeout?: ReturnType<typeof setTimeout>;
  autosaveInterval?: ReturnType<typeof setInterval>;
}

interface LegacyRoomInfo {
  users: { [uid: string]: LegacyUser };
}

interface LegacyWhiteboard {
  drawDataList: DrawData[];
  locked: boolean;
}


interface RoomMessage {
  id: string;
  roomId: string;
  timestamp: Date;
  originUsername: string;
  contents: string;
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


// exports
export { LegacyUser, LegacyRoom, LegacyRoomInfo, LegacyWhiteboard, Room, RoomInfo, Whiteboard, RoomMessage, BoardEvent, DrawEvent, DrawEventAction, DrawPreviewEvent, DrawPreviewEventAction, DrawData, DrawDataLinkedList, DrawDataLinkedNode };
