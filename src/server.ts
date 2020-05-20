import http from 'http';

import app from './App';
import Socket from './Socket';

import config from '../config/main';

let httpServer = new http.Server(app);
let socketServer = new Socket(httpServer);

const port = process.env.PORT || config.port;
const server = httpServer.listen(port, function() {
  console.log('listening on *:', port);
});
