<div align="center">
  <h1>lcd-board</h1>
  <img src="logo.svg" alt="lcd-board logo" height="128">
  <p>
    A <strong>Collaborative Whiteboarding</strong> Web App
  </p>
</div>

<hr>

This web app operates on the idea of rooms, where each room has a unique whiteboard. It allows multiple users to concurrently connect and draw in a room at any given point in time.

As of now, room whiteboards are only persistent for as long as at least one user is connected to the room. If no one's connected to a room with a non-empty whiteboard, it'll be automatically discarded after 60 seconds.

The web app has quite a bit of drawing tools to choose from, and you can pick the color and size on supported tools. Following is a list of them:
- Pen
    - Basic pen.
    - Auto-smoothes strokes.
    - Optimised for memory efficiency.
        - Best for usage on large drawings.
- Dynamic Pen
    - Standard pen for all your needs.
    - Supports pressure sensitivity, e.g. via
        - Wacom tablet and stylus (requires Firefox, Chrome)
        - Apple Pencil (requires Safari on iPadOS 13+)
        - 3D Touch (requires Safari on iOS 13+)
        - Apple Force Touch trackpad (requires Safari)
        - ... and anything else that supports [PointerEvent.pressure](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/pressure)
- Fountain Pen
    - Expressive pen style.
    - Dynamic stroke size which changes with speed.
        - Allows for natural-looking ink.
- Eraser
    - Mistakes can be corrected easily.
    - Note: Performs vector erasing, not pixel erasing.
- Laser Pointer
    - Just like using a real life laser pointer.
    - Especially useful for collabration.
- Weighted Pen [WIP]
    - currently renamed to Drunk Pen as a joke as it's really broken
- Selection [WIP]

Have fun!

## Quickstart

- Make sure you already have `nodejs` and `npm` installed.
- Install `yarn`
```
npm install -g yarn
```
- Install dependencies
```
yarn install
```
- Build project
```
yarn run gulp build
```
- Start the server
```
yarn start
```
- Go to [http://localhost:8080](http://localhost:8080)
- Login to a room and draw stuff
- ???
- Profit

## Full installation and usage details
### Requirements
Just make sure you have nodejs and npm and you're good to go!

### Installing
Install yarn if necessary
```
npm install -g yarn
```

Next, install all dependencies required.
```
yarn install
```

### Building
Build the entire project

```
yarn run gulp build
```

...or you can build parts of the project

```
yarn run gulp styles
yarn run gulp scripts
yarn run gulp main
yarn run gulp libs # copies lib after installing
yarn run gulp assets
yarn run gulp views
```

Watch the entire project for changes and rebuild if needed
```
yarn run gulp watch
```

... or watch only some parts
```
yarn run gulp 'watch styles'
yarn run gulp 'watch scripts'
yarn run gulp 'watch views'
yarn run gulp 'watch main'
```

### Debugging
Debugging is made easy with the following:
```
yarn debug
```
Server automatically restarts on project rebuild when using this.

### Running
Ready to start the server and use the webapp?
```
yarn start
```
Done!

The page will thus be hosted on `localhost:8080` by default.

### Drawing

Click and drag a mouse, drag your finger across a touchscreen, or write using a digital stylus. You can draw anywhere on the entire window, except the top bar.

Click or tap the current drawing tool or connection status indicator to view more options.

## Custom drawing tools

You can easily add your own drawing tools simply by extending the `DrawingTool` class in `DrawingTool.ts`.

A `DrawingTool` is simply a dummy implementation of a fixed-width pen. Its size is configurable but color is determined based on the canvas active color by default.

A `BoardEvent` is a type for all events that will result in changes to the canvas. `BoardEvent`s can be either `DrawEvent`s or `EditEvent`s.

A `DrawEvent` is an interface which forms the basis of all event packets regarding any action on the drawing canvas which results in the creation of new items.

An `EditEvent` is an interface which forms the basis of all event packets regarding any action which manipulates existing items on the canvas.

You must override the `clone()` method so as the tool can be cloned for drawing by each separate user.

You should only need to override the following methods to configure your tool's handling from system events all the way to drawing a stroke:

- `handleMouseEventAsBoardEvent(_:)`
    - handles conversion from a paper.js MouseEvent to a `BoardEvent`.
- `handleKeyEventAsBoardEvent(_:)`
    - handles conversion from a paper.js KeyEvent to a `BoardEvent`.
- `processBoardEvent(_:)`
    - handles translating a `BoardEvent` to graphics on the canvas (or anything else).

Add them to the list of exported tools in `DrawingTool.ts`, and remember to import them and add to the list of tools in `index.ts`.

You're done! Remember to rebuild the project, then try it out in your browser.

You may find the following parameters useful to access:
- `previousDrawEvent`
    - contains the previous draw event for a single stroke, if there is one.

You may want to modify the following parameters when drawing:
- `sizeAdjustmentFactor`
    - adjusts the size by said factor before rendering and saves it to `drawEvent.adjustedSize`.
- `pressureSensitive`
    - configures whether pressure modifies the `sizeAdjustmentFactor` property.

If you are creating any new paths when processing a `BoardEvent`, do remember to register the path as follows:
```typescript
if (event.group) {
    pathGroupMap.insert({ref:this.path}, event.group);
} else if (this.channel) {
    pathGroupMap.insert({ref:this.path}, this.channel.getGroup(event, this.getCurrentDrawGroup()));
}
```

Other variables and methods that can be overriden or have their default values changed depending on your implementation:
- `minSize`
- `size`
- `maxSize`
- `setSize(_:)`
- `getSize()`
- `getColor()`

## TODOs

- Add infinite canvas support
- Improve implementation to uniquely tie each path element to a UUID
- Fix Weighted Pen tool
- Fix all tools except Pen to work with Selection tool
- Improve efficiency on large canvases

## Contributors

- Li Yue Chen ([@l-yc](https://github.com/l-yc))
- Lim Wern Jie ([@wernjie](https://github.com/wernjie))






