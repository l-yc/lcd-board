
import express, { Request, Response } from 'express';
import bodyparser from 'body-parser';
import cookieparser from 'cookie-parser';
import path from 'path';
import database from './Database';


const SESSION_COOKIE_KEY = 'LCDB_ConnectionToken';
const SESSION_USER_KEY   = 'LCDB_ConnectionUser';

class App {
  public express: any;

  constructor() {
    // Create a new express application instance
    this.express = express();

    this.config();
    this.mountRoutes();
  }

  private config(): void {
    // Configure Express to use EJS
    this.express.set('views', path.join(__dirname, 'views'));
    this.express.set('view engine', 'ejs');
    this.express.use(express.static(path.join(__dirname, 'public')));
    this.express.use(cookieparser());
    this.express.use(bodyparser.urlencoded({extended: true}));
    this.express.use(bodyparser.json());
  }

  private verifyToken(request: Request, handler: (valid: boolean) => void) {
    let info = this.getAuthInfo(request);
    if (info) {
      database.verifyLoginToken(info.username, info.token, (s, e) => {
        handler(s);
      });
    } else handler(false);
  }

  private setToken(response: Response, username: string, token: string) {
    response.cookie(SESSION_COOKIE_KEY, token   , { maxAge: 3*86400*1000, httpOnly: true });
    response.cookie(SESSION_USER_KEY  , username, { maxAge: 3*86400*1000 });
  }

  private refreshToken(request: Request, response: Response) {
    let info = this.getAuthInfo(request);
    if (info) {
      this.setToken(response, info.username, info.token);
    }
  }

  private getAuthInfo(request: Request): {username: string, token: string} | null {
    const token    = request.cookies[SESSION_COOKIE_KEY] as string | null;
    const username = request.cookies[SESSION_USER_KEY] as string | null;
    return (username && token) ? {username: username, token: token} : null;
  }

  private deleteToken(response: Response) {
    response.cookie(SESSION_COOKIE_KEY, '', { maxAge: 0, httpOnly: true });
    response.cookie(SESSION_USER_KEY, '', { maxAge: 0 });
  }


  private mountRoutes(): void {
    const router = express.Router();

    //HTML
    router.get('/', (req: Request, res: Response) => {
      if (this.getAuthInfo(req) != null) {
        this.verifyToken(req, (valid) => {
          if (!valid) {
            this.deleteToken(res);
          };
          res.render('index', { title: 'lcd-board' });
        });
      } else {
        res.render('index', { title: 'lcd-board' });
      }
    });
    router.get('/assets/*', (req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, req.url));
    });


    //API routes
    router.post('/login', (req: Request, res: Response) => {
      console.log(req.body);
      const username = req.body.username;
      const password = req.body.password;

      if (username == null || password == null) {
        let auth = {success: false, "error": "Incomplete submission provided."};
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(auth));
        return;
      }

      let info = this.getAuthInfo(req);
      if (info) database.logout(info.username, info.token, () => {});

      database.login(username, password, (success, err, token) => {
        let auth = {'success': success, 'error': err};
        res.setHeader('Content-Type', 'application/json');
        if (token) {
          this.setToken(res, username, token);
        } else {
          this.deleteToken(res);
        }
        res.end(JSON.stringify(auth));
      });

    });
    router.post('/logout', (req: Request, res: Response) => {
      const info = this.getAuthInfo(req);

      if (info == null) {
        let auth = {success: false, error: 'No login session to logout.'};
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(auth));
        return;
      }

      database.logout(info.username, info.token, (success, err) => {
        let auth = {'success': success, 'error': err};
        res.setHeader('Content-Type', 'application/json');
        this.deleteToken(res);
        res.end(JSON.stringify(auth));
      });

    });

    router.post('/register', (req: Request, res: Response) => {
      const username = req.body.username;
      const password = req.body.password;

      if (username == null || password == null) {
        let auth = {success: false, error: 'Incomplete submission provided.'};
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(auth));
        return;
      }

      let info = this.getAuthInfo(req);
      if (info) database.logout(info.username, info.token, () => {});

      database.register(username, password, (success, err, token) => {
        let auth = {'success': success, 'error': err};
        res.setHeader('Content-Type', 'application/json');
        if (token) this.setToken(res, username, token);
        res.end(JSON.stringify(auth));
      });

    });

    router.post('/guest', (req: Request, res: Response) => {
      const username = req.body.username;

      if (username == null) {
        let auth = {success: false, error: 'Incomplete submission provided.'};
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(auth));
        return;
      }

      database.registerGuest(username, (success, err, token) => {
        let auth = {'success': success, 'error': err};
        res.setHeader('Content-Type', 'application/json');
        if (token) this.setToken(res, username, token);
        res.end(JSON.stringify(auth));
      });

    });

    router.get('/demo', (req: Request, res: Response) => {
      this.verifyToken(req, (valid) => {
        database.testDump((dump) => {
          res.render('demo',
                     { title: 'lcd-board user list [database dump demo]',
                       message: valid ? dump.join(", ") : 'Unauthorized.'
                     }
                    );
        });
      });
    });

    //mapping functions to database calls
    const U_N_OBJ = ['username', 'name', 'data'];
    const U_OBJ = ['username', 'data'];
    const U_N = ['username', 'name'];
    const U_ID = ['username', 'id'];
    const ID_N = ['id', 'name'];
    const N_OBJ = ['name', 'data'];
    const OBJ_ = ['data'];
    const ID_ = ['id'];
    const ID_R = ['id', 'range'];
    const U_ = ['username'];

    let databaseCalls : [string, string[]][] = [
      ['createRoom',              U_N],  //u, name, DRR
      ['saveRoomInfo',            OBJ_], //info, SRR
      ['retrieveRoomInfo',        ID_], //id, DRR
      ['deleteRoomWithInfo',      ID_], //id, SRR
      ['retrieveOwnerRoomList',   U_], //u, DRR
      ['retrievePopularRoomList', U_], //u, DRR
      ['retrieveRoomSearchResults', U_OBJ], //u, info, DRR 
      ['createWhiteboard',   ID_N], //id, name, DRR
      ['retrieveWhiteboard', ID_N], //id, name, DRR
      ['updateWhiteboard',   N_OBJ], //info, SRR
      ['deleteWhiteboard',   ID_N], //id, name, SRR
      ['retrieveFavouriteRoomList', U_], //u, DRR
      ['addFavouriteRoom',          U_ID], //u, rid, SRR
      ['deleteFavouriteRoom',       U_ID], //u, rid, SRR
      ['retrieveFavouriteDrawingList', U_      ], //u, DRR
      ['addFavouriteDrawing',          U_N_OBJ ], //u, name, wbinfo, SRR
      ['retrieveFavouriteDrawing',     U_N     ], //u, name, DRR
      ['deleteFavouriteDrawing',       U_N     ], //u, name, DRR
      ['addRoomMessage',       OBJ_], //info, SRR
      ['retrieveRoomMessages', ID_R], //rid, (a<b), DRR
      ['recordJoinRoom',       U_ID], //u, rid, SRR
      ['recordDisconnectRoom', U_ID], //u, rid, SRR
      ['retrievePastJoinedRooms', U_  ], //u, DRR
      ['deletePastJoinedRoom',    U_ID], //u, rid, SRR
      ['clearPastJoinedRooms',    U_  ]  //u, SRR
    ];

    let databaseCallParams : { [fcall:  string]: [number, string[]]} = {};
    let _i = 0;
    for (let o of databaseCalls) {
      databaseCallParams[o[0]] = [_i, o[1]];
      _i++;
    }

    router.post('/api/:fcall', (req: Request, res: Response) => {
      let fcall = req.params.fcall;

      let info = this.getAuthInfo(req);
      this.verifyToken(req, (valid) => {
        if (valid) {
          //find mapping for call to database function
          if (databaseCallParams.hasOwnProperty(fcall)) {
            let body = req.body;
            body.username = info?.username || '';

            let params = databaseCallParams[fcall][1].map((x : string) => {
              return body[x];
            });

            for (let param of params) {
              if (param == undefined) {
                let ans = {'success': false, 'error': 'Incomplete API call.'};
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(ans));
                res.status(400);
                return;
              }
            }

            params.push((success: boolean, err: string | null, data?: any | null) => {
              console.log('database response received');

              let ans = {'success': success, 'error': err, 'data': data};
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(ans));
            });

            switch (fcall) {
              case 'createRoom': (database.createRoom as any)(...params); break;
              case 'saveRoomInfo': (database.saveRoomInfo as any)(...params); break;
              case 'retrieveRoomInfo': (database.retrieveRoomInfo as any)(...params); break;
              case 'deleteRoomWithInfo': (database.deleteRoomWithInfo as any)(...params); break;
              case 'retrieveOwnerRoomList': (database.retrieveOwnerRoomList as any)(...params); break;
              case 'retrievePopularRoomList': (database.retrievePopularRoomList as any)(...params); break;
              case 'retrieveRoomSearchResults': (database.retrieveRoomSearchResults as any)(...params); break;
              case 'createWhiteboard': (database.createWhiteboard as any)(...params); break;
              case 'retrieveWhiteboard': (database.retrieveWhiteboard as any)(...params); break;
              case 'updateWhiteboard': (database.updateWhiteboard as any)(...params); break;
              case 'deleteWhiteboard': (database.deleteWhiteboard as any)(...params); break;
              case 'retrieveFavouriteRoomList': (database.retrieveFavouriteRoomList as any)(...params); break;
              case 'addFavouriteRoom': (database.addFavouriteRoom as any)(...params); break;
              case 'deleteFavouriteRoom': (database.deleteFavouriteRoom as any)(...params); break;
              case 'retrieveFavouriteDrawingList': (database.retrieveFavouriteDrawingList as any)(...params); break;
              case 'addFavouriteDrawing': (database.addFavouriteDrawing as any)(...params); break;
              case 'retrieveFavouriteDrawing': (database.retrieveFavouriteDrawing as any)(...params); break;
              case 'deleteFavouriteDrawing': (database.deleteFavouriteDrawing as any)(...params); break;
              case 'addRoomMessage': (database.addRoomMessage as any)(...params); break;
              case 'retrieveRoomMessages': (database.retrieveRoomMessages as any)(...params); break;
              case 'recordJoinRoom': (database.recordJoinRoom as any)(...params); break;
              case 'recordDisconnectRoom': (database.recordDisconnectRoom as any)(...params); break;
              case 'retrievePastJoinedRooms': (database.retrievePastJoinedRooms as any)(...params); break;
              case 'deletePastJoinedRoom': (database.deletePastJoinedRoom as any)(...params); break;
              case 'clearPastJoinedRooms': (database.clearPastJoinedRooms as any)(...params); break;
              default:
                console.log("Missing fcall " + fcall);
                let ans = {'success': false, 'error': 'Invalid api call.'};
                res.setHeader('Content-Type', 'application/json');
                res.status(403);
                res.end(JSON.stringify(ans));
            }

          } else {
            let ans = {'success': false, 'error': 'Invalid api call.'};
            res.setHeader('Content-Type', 'application/json');
            res.status(403);
            res.end(JSON.stringify(ans));
          }
        } else {
          let ans = {'success': false, 'error': 'You are not authenticated.'};
          res.setHeader('Content-Type', 'application/json');
          res.status(401);
          res.end(JSON.stringify(ans));
        }
      });
    });

    //
    this.express.use('/', router);
  }

};

export default new App().express;
