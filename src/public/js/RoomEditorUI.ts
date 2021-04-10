
import { log, api, getCookie } from './utils';
import { RoomInfo, Whiteboard } from '../../types';
export class RoomEditorUI {

  private roomItemContainer: HTMLDivElement;
  private whiteboardsContainer: HTMLDivElement;

  private roomEditForm: HTMLFormElement;

  private roomAddButton: HTMLElement;
  private whiteboardAddButton: HTMLElement;

  private roomIdField: HTMLInputElement;
  private roomNameField: HTMLInputElement;
  private roomIsPublicCheckbox: HTMLInputElement;
  private roomIsActiveCheckbox: HTMLInputElement;
  private roomIsPersistentCheckbox: HTMLInputElement;

  private roomSaveButton: HTMLInputElement;
  private roomDiscardChangesButton: HTMLElement;

  private activeEditingRoomObj: RoomInfo | null = null;

  constructor() {
    this.roomItemContainer = document.querySelector(".room-item-container") as HTMLDivElement;
    this.whiteboardsContainer = document.querySelector("#rmeWbs") as HTMLDivElement;

    this.roomEditForm = document.querySelector("#room-edit-form") as HTMLFormElement;

    this.roomAddButton = document.querySelector(".room-item-add") as HTMLElement;
    this.whiteboardAddButton = document.querySelector(".room-edit-wb-row-add") as HTMLElement;

    this.roomIdField = document.querySelector("#rmeId") as HTMLInputElement;
    this.roomNameField = document.querySelector("#rmeName") as HTMLInputElement;
    this.roomIsPublicCheckbox = document.querySelector("#rmeIsPublic") as HTMLInputElement;
    this.roomIsActiveCheckbox = document.querySelector("#rmeIsActive") as HTMLInputElement;
    this.roomIsPersistentCheckbox = document.querySelector("#rmeIsPersistent") as HTMLInputElement;

    this.roomSaveButton = document.querySelector("#rmeSave") as HTMLInputElement;
    this.roomDiscardChangesButton = document.querySelector("#rmeDiscard") as HTMLElement;
  }

  private configureItemElement(title: string | null, subtitle: string | null, type: 'room' | 'whiteboard', buttonConfigs: {title: string, destructive?: boolean, warning?: string, handler: (event: any) => void}[]): HTMLElement {



    let btnCont = document.createElement('div');
    if (type == 'room')
      btnCont.classList.add('room-item-buttons');
    else
      btnCont.classList.add('room-edit-wb-btns');
    for (let config of buttonConfigs) {

      let a = document.createElement('a') as HTMLElement;
      a.innerText = config.title;
      if (config.destructive) {
        a.classList.add('destructive');
      }
      if (config.warning) {
        a.onclick = (e) => { if (confirm('Are you sure?\n' + config.warning)) config.handler(e); };
      } else {
        a.onclick = config.handler;
      }

      btnCont.appendChild(a);
    }

    let e = document.createElement('div') as HTMLDivElement;
    if (type == 'room')
      e.classList.add('room-item');
    else
      e.classList.add('room-edit-wb-row');

    if (title) {
      let t1 = document.createElement('span') as HTMLSpanElement;
      let t1b = document.createElement('strong') as HTMLElement;
      t1b.style.fontSize = 'calc(var(--font-size) + 3px)';
      t1b.innerText = title;
      t1b.innerHTML += '<br>';
      t1.appendChild(t1b);
      e.appendChild(t1);
    }

    if (subtitle) {
      let t2 = document.createElement('span') as HTMLSpanElement;
      t2.innerText = subtitle;
      e.appendChild(t2);
    }
    e.appendChild(btnCont);
    return e;
  }

  private configureItemError(msg: string, type: 'room' | 'whiteboard') {
    let e = document.createElement('div') as HTMLDivElement;
    if (type == 'room')
      e.classList.add('room-item');
    else
      e.classList.add('room-edit-wb-row');
    e.classList.add('error');
    e.innerText = msg;
    return e;
  }

  private configureItemInfo(msg: string, type: 'room' | 'whiteboard') {
    let e = document.createElement('div') as HTMLDivElement;
    if (type == 'room')
      e.classList.add('room-item');
    else
      e.classList.add('room-edit-wb-row');
    e.innerText = msg;
    return e;
  }

  public configureRoomItems() {
    this.roomItemContainer.innerHTML = '';

    this.roomAddButton.onclick = (e) => {
      api('createRoom', {name: 'untitled'}, (res, status) => {
        if (res.success) {
          let roomInfo = res.data;
          this.setupEditRoom(roomInfo);
          this.configureRoomItems();
        } else {
          alert('Error: ' + res.error);
        }
      });
    };

    api(
      'retrieveOwnerRoomList', {},
      (data, status) => {

        if (data.success) {
          for (let room of data.data) {
            console.log(room);
            let ele = this.configureItemElement(
              room.displayName,
              'by ' + room.owner,
              'room',
              [{
                title: 'Join',
                handler: (e) => {
                  this.joinRoom(room.roomId);
                }
              },{
                title: 'Edit',
                handler: (e) => {
                  this.editRoom(room.roomId);
                }
              },{
                title: 'Delete',
                destructive: true,
                warning: 'This will delete all data associated with the room.',
                handler: (e) => {
                  api('deleteRoomWithInfo', {id: room.roomId}, (res, status) => {
                    if (res.success) this.configureRoomItems();
                    else alert('Operation failed: ' + res.error);
                  });
                }
              }]
            );
            this.roomItemContainer.appendChild(ele);
          }
        } else {
          let ele = this.configureItemError(data.error, 'room');
          this.roomItemContainer.appendChild(ele);
        }

        log(status, data);
      }
    );

    this.displayCurrentEdits();
  }

  private joinRoomHandler: ((roomId: string) => void) | null = null;
  public setJoinRoomHandler(handler: (roomId: string) => void) {
    this.joinRoomHandler = handler;
  }
  public joinRoom(roomId: string) {
    if (this.joinRoomHandler) this.joinRoomHandler(roomId);
    else alert('error: ui link to whiteboard tab missing');
  }


  public editRoom(roomId: string) {
    api('retrieveRoomInfo', {id: roomId}, (res, status) => {
      if (res.success) {
        let roomInfo: RoomInfo = res.data;
        this.setupEditRoom(roomInfo);
      } else {
        alert("Error: " + res.error);
      }
    });
  }


  public setupEditRoom(roomInfo: RoomInfo | null) {
    this.activeEditingRoomObj = roomInfo;
    this.displayCurrentEdits();
  }
  public displayCurrentEdits() {
    if (this.activeEditingRoomObj == null) {

      this.roomIdField.value = '';
      this.roomIdField.disabled = true;
      this.roomNameField.value = '';
      this.roomNameField.disabled = true;
      this.whiteboardsContainer.innerHTML = '';
      this.roomIsPublicCheckbox.checked = true;
      this.roomIsPublicCheckbox.disabled = true;
      this.roomIsActiveCheckbox.checked = true;
      this.roomIsActiveCheckbox.disabled = true;
      this.roomIsPersistentCheckbox.checked = false;
      this.roomIsPersistentCheckbox.disabled = true;
      this.roomSaveButton.disabled = true;
      this.roomDiscardChangesButton.classList.add('disabled');
      this.roomDiscardChangesButton.onclick = (e) => {};

    } else {

      let room = this.activeEditingRoomObj;

      this.roomIdField.value = room.id;
      this.roomIdField.disabled = true;

      this.roomNameField.value = room.displayName;
      this.roomNameField.disabled = false;

      this.whiteboardAddButton = this.whiteboardAddButton.cloneNode(true) as HTMLDivElement;
      this.whiteboardsContainer.innerHTML = '';
      if (room.isActive) {
        this.whiteboardsContainer.appendChild(this.whiteboardAddButton);
        for (let wb of room.whiteboards) {
          this.whiteboardAddButton.before(this.createWbRow(wb));
        }
        this.whiteboardsContainer.classList.remove('hidden');
      } else {
        this.whiteboardsContainer.classList.add('hidden');
      }

      this.roomIsPublicCheckbox.checked = room.isPublic;
      this.roomIsPublicCheckbox.disabled = false;

      this.roomIsActiveCheckbox.checked = room.isActive;
      this.roomIsActiveCheckbox.disabled = false;
      this.roomIsActiveCheckbox.onchange = () => {

        if (this.roomIsActiveCheckbox.checked) {
          this.whiteboardsContainer.classList.remove('hidden');
        } else {
          this.whiteboardsContainer.classList.add('hidden');
        }

        this.roomIsPersistentCheckbox.disabled = !this.roomIsActiveCheckbox.checked;
      }

      this.roomIsPersistentCheckbox.checked = room.isPersistent || false;
      this.roomIsPersistentCheckbox.disabled = !room.isActive;

      this.whiteboardAddButton.onclick = (e) => this.addWbForCurrentEdit();
      
      this.roomSaveButton.disabled = false;
      this.roomDiscardChangesButton.classList.remove('disabled')

      this.roomEditForm.onsubmit = (e) => {
        e.preventDefault();
        this.saveCurrentEdits(true);
      }
      this.roomDiscardChangesButton.onclick = (e) => {
        this.setupEditRoom(null);
      }
    }
  }

  public saveCurrentEdits(prompt: boolean) {
    let room = this.activeEditingRoomObj;
    if (room) {
      let newRoom = Object.assign({}, room) as RoomInfo;
      newRoom.displayName = this.roomNameField.value;
      newRoom.isActive = this.roomIsActiveCheckbox.checked;
      newRoom.isPublic = this.roomIsPublicCheckbox.checked;
      newRoom.isPersistent = newRoom.isActive ? this.roomIsPersistentCheckbox.checked : undefined;
      if (!newRoom.isActive) {
        newRoom.whiteboards = [];
      }
      api('saveRoomInfo', {data: newRoom}, (res, status) => {
        if (res.success) {
          if (prompt) alert('Save success!');
          this.activeEditingRoomObj = newRoom;
          this.configureRoomItems();
        } else {
          if (prompt) alert('Error Saving: ' + res.error);
        }
      });
    }
  }

  public addWbForCurrentEdit() {
    let room = this.activeEditingRoomObj;
    if (room) {
      let ans = prompt('Please type name of new whiteboard...\nNote: This will be immediately saved.');
      if (ans) {
        api('createWhiteboard', {id: room.id, name: ans}, (res, status) => {
          if (res.success) {
            let wb: Whiteboard = res.data;
            this.whiteboardAddButton.before(
              this.createWbRow(wb)
            );
            this.activeEditingRoomObj?.whiteboards.push(wb);
          } else {
            alert(res.error);
          }
        });
      }
    }
  }
  private createWbRow(wb: {name: string, locked: boolean}): HTMLElement {
    let ele = this.configureItemElement(null, wb.name, 'whiteboard', [
      /*{
        title: 'Rename',
        warning: 'If any existing users are drawing on the whiteboard, they will be disconnected.',
        handler: () => {
        }
      }, {
        title: wb.locked ? 'Unlock' : 'Lock',
        warning: 'The whiteboard will be read only, and connected users may be interrupted.',
        handler: () => {
          let room = this.activeEditingRoomObj;
          if (room) {
            let whiteboard: Whiteboard = {
              roomId: room.id,
              name: wb.name,
              locked: !wb.locked,
              drawDataList: []
            }
            api('updateWhiteboard', whiteboard, (res, status) => {
              if (res.success) {
                wb.locked = !wb.locked;
                let newRow = this.createWbRow(wb);
                ele.after(newRow);
                ele.remove();
              } else {
                alert('Error: ' + res.error);
              }
            });
          }
        }
      }, */{
        title: 'Delete',
        destructive: true,
        warning: 'This whiteboard and its associated drawing will be deleted immediately.',
        handler: () => {
          let room = this.activeEditingRoomObj;
          if (room)
            api('deleteWhiteboard', {id: room.id, name: wb.name}, (res, status) => {
              if (res.success)
                ele.remove();
              else
                alert('Error removing whiteboard: ' + res.error);
            });
        }
      }
    ]);

    return ele;
  }


}


