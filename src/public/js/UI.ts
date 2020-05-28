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

    const toolPickerContainer = document.getElementById('tool-picker-container');
    if (toolPickerContainer) {
      toolPickerContainer.innerHTML = '';

      const activeTool = this.drawingCanvas.getActiveTool();
      for (let tool of this.drawingCanvas.getTools()) {
        tool.interceptPressureEventsOnCanvas(this.drawingCanvas.htmlCanvas);

        const button = document.createElement("button");
        button.innerText = tool.name;
        button.classList.add('toolOption');

        if (tool == activeTool) 
          button.classList.add('selectedOption');

        button.onclick = () => {
          this.drawingCanvas?.setActiveTool(tool);

          let allOptions = Array.from(toolPickerContainer.getElementsByClassName('toolOption'));
          for (let option of allOptions) {
            option.classList.remove('selectedOption');
          };
          button.classList.add('selectedOption');
        }

        toolPickerContainer.appendChild(button);
      }
    }
    const colorPickerContainer = document.getElementById('color-picker-container');
    if (colorPickerContainer) {
      colorPickerContainer.innerHTML = '';
      let activeColor = this.drawingCanvas.getActiveColor(); 

      for (let color of this.drawingCanvas.getColors()) {
        const button = document.createElement("button");

        button.style.backgroundColor = color;;
        button.classList.add('colorOption');

        if (color == activeColor)
          button.classList.add('selectedOption');

        button.onclick = () => {
          this.drawingCanvas?.setActiveColor(color);

          let allOptions = Array.from(colorPickerContainer.getElementsByClassName('colorOption'));
          for (let option of allOptions) {
            option.classList.remove('selectedOption');
          };
          button.classList.add('selectedOption');
        }
        colorPickerContainer.appendChild(button);
      }

      let cachedColor = '#ffffff'
      const colorPickerButton = document.createElement("button");
      colorPickerButton.classList.add('colorOption', 'colorPicker');
      colorPickerButton.onclick = () => {
        let result = prompt("Enter hex color code (#??????):", cachedColor) || "";
        this.drawingCanvas?.setActiveColor(result);
        if (result == this.drawingCanvas?.getActiveColor()) {
          let allOptions = Array.from(colorPickerContainer.getElementsByClassName('colorOption'));
          for (let option of allOptions) {
            option.classList.remove('selectedOption');
          };
          colorPickerButton.classList.add('selectedOption');
          colorPickerButton.style.backgroundColor = result;
          cachedColor = result;
        }
      }
      colorPickerContainer.appendChild(colorPickerButton);
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
