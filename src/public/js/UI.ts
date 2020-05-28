import { RoomInfo } from '../../Socket';

import { DrawingCanvas } from './DrawingCanvas';
import { DrawingMember } from './DrawingMember';

export class UI {

  readonly drawingCanvas: DrawingCanvas | null = null;
  constructor(canvas?: DrawingCanvas | null) {
    if (canvas) this.drawingCanvas = canvas;
  }

  updateRoomInfo(info: RoomInfo) {
    let members = document.querySelector('.room-info .members-container .members') as HTMLElement;
    if (!members) return;

    const canvas = this.drawingCanvas;
    let drawingMembers: DrawingMember[] = [];

    members.innerHTML = "";

    for (let userId in info.users) {
      if (!info.users.hasOwnProperty(userId)) return;

      if (canvas) drawingMembers.push(new DrawingMember(userId, info.users[userId]));

      let u = document.createElement('span');
      u.innerText = info.users[userId].username as string;
      members.appendChild(u);
    };

    if (canvas) canvas.setDrawingMembers(drawingMembers);
  }

  configurePickers() {
    if (!this.drawingCanvas) return;

    let toolPickerContainer = document.getElementById('tool-picker-container');
    if (toolPickerContainer) {
      for (let tool of this.drawingCanvas.getTools()) {
        tool.interceptPressureEventsOnCanvas(this.drawingCanvas.htmlCanvas);
        let button = document.createElement("button");
        button.innerText = tool.name;
        button.classList.add('toolOption');
        button.onclick = () => {
          this.drawingCanvas?.setActiveTool(tool);
        }
        toolPickerContainer.appendChild(button);
      }
    }
    let colorPickerContainer = document.getElementById('color-picker-container');
    if (colorPickerContainer) {
      for (let color of this.drawingCanvas.getColors()) {
        const button = document.createElement("button");
        button.style.backgroundColor = color;;
        button.classList.add('colorOption');
        button.onclick = () => {
          this.drawingCanvas?.setActiveColor(color)
        }
        colorPickerContainer.appendChild(button);
      }
    }
  }

  configureLoginForm() {
    const form = document.querySelector('#login-form') as HTMLFormElement;
    if (form) form.addEventListener('submit', (event) => {
      event.preventDefault();
      let data = new FormData(form);
      let uname = data.get('username') as string;
      let room = data.get('room') as string;
      if (!uname || !room) {
        alert('You need to join a room with a username!');
        return;
      }

      this.drawingCanvas?.getSocketServer()?.register(uname);
      this.drawingCanvas?.getSocketServer()?.join(room);

      const loginOverlay = document.getElementById('login-overlay');
      if (loginOverlay) {
        loginOverlay.style.opacity = '0';
        setTimeout(function () {
          loginOverlay.style.display = 'none';
        }, 500);
      }
    });
  }
};
