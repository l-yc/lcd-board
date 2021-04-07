
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
    if (info)
      database.verifyLoginToken(info.username, info.token, (s, e) => {
        handler(s);
      });
    else
      handler(false);
  }

  private setToken(response: Response, username: string, token: string) {
    response.cookie(SESSION_COOKIE_KEY, username, { maxAge: 900000, httpOnly: true });
    response.cookie(SESSION_USER_KEY  , token   , { maxAge: 900000 });
  }

  private refreshToken(request: Request, response: Response) {
    let info = this.getAuthInfo(request);
    if (info) {
      response.cookie(SESSION_COOKIE_KEY, info.username, { maxAge: 900000, httpOnly: true });
      response.cookie(SESSION_USER_KEY  , info.token   , { maxAge: 900000 });
    }
  }

  private getAuthInfo(request: Request): {username: string, token: string} | null {
    const username = request.cookies[SESSION_USER_KEY] as string | null;
    const token    = request.cookies[SESSION_COOKIE_KEY] as string | null;
    return (username && token) ? {username: username, token: token} : null;
  }

  private deleteToken(response: Response) {
    response.cookie(SESSION_COOKIE_KEY, '', { maxAge: 0, httpOnly: true });
    response.cookie(SESSION_USER_KEY, '', { maxAge: 0 });
  }


  private mountRoutes(): void {
    const router = express.Router();

    //HTML
    router.get('/', function (req: Request, res: Response) {
      res.render('index', { title: 'lcd-board' });
    });
    router.get('/assets/*', function (req: Request, res: Response) {
      res.sendFile(path.join(__dirname, req.url));
    });

    router.get('/login', function (req: Request, res: Response) {
      res.render('login', { title: 'lcd-board' });
    });

    //API routes
    router.post('/login', (req: Request, res: Response) => {
      const username = req.body.username;
      const password = req.body.password;

      if (username == null || password == null) {
        let auth = {success: false, "error": "incomplete submission provided"};
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(auth));
        return;
      }

      database.login(username, password, (success, err, token) => {
        let auth = {'success': success, 'error': err};
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(auth));
      });

    });
    router.post('/logout', (req: Request, res: Response) => {
      const info = this.getAuthInfo(req);

      if (info == null) {
        let auth = {success: false, error: 'incomplete submission provided'};
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
        let auth = {success: false, error: 'incomplete submission provided'};
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(auth));
        return;
      }

      database.register(username, password, (success, err, token) => {
        let auth = {'success': success, 'error': err};
        res.setHeader('Content-Type', 'application/json');
        if (token) this.setToken(res, username, token);
        res.end(JSON.stringify(auth));
      });

    });


    //mapping functions to database calls
    const U_N_OBJ = ['username', 'name', 'data'];
    const U_N = ['username', 'name'];
    const U_ID = ['username', 'id'];
    const ID_N = ['id', 'name'];
    const OBJ_ = ['data'];
    const ID_ = ['id'];
    const ID_R = ['id', 'range'];
    const U_ = ['id'];

    let databaseCalls : [any, string[]][] = [

      [database.createRoom,       U_N],  //u, name, DRR
      [database.saveRoomInfo,     OBJ_], //info, SRR
      [database.retrieveRoomInfo, OBJ_], //id, DRR

      [database.createWhiteboard,   ID_N], //id, name, DRR
      [database.retrieveWhiteboard, ID_N], //id, name, DRR
      [database.updateWhiteboard,   OBJ_], //info, SRR

      [database.retrieveFavouriteRoomList, U_], //u, DRR
      [database.addFavouriteRoom,          U_ID], //u, rid, SRR
      [database.deleteFavouriteRoom,       U_ID], //u, rid, SRR

      [database.retrieveFavouriteDrawingList, U_      ], //u, DRR
      [database.addFavouriteDrawing,          U_N_OBJ ], //u, name, wbinfo, SRR
      [database.retrieveFavouriteDrawing,     U_N     ], //u, name, DRR
      [database.deleteFavouriteDrawing,       U_N     ], //u, name, DRR

      [database.addRoomMessage,       OBJ_], //info, SRR
      [database.retrieveRoomMessages, ID_R], //rid, (a<b), DRR

      [database.recordJoinRoom,       U_ID], //u, rid, SRR
      [database.recordDisconnectRoom, U_ID], //u, rid, SRR

      [database.retrievePastJoinedRooms, U_  ], //u, DRR
      [database.deletePastJoinedRoom,    U_ID], //u, rid, SRR
      [database.clearPastJoinedRooms,    U_  ]  //u, SRR

    ];

    let databaseCallsRef : { [fcall:  string]: [any, string[]]} = {};
    for (let o of databaseCalls) {
      databaseCallsRef[o[0].name as string] = o;
    }

    router.post('/api/:fcall', (req: Request, res: Response) => {
      let fcall = req.params.fcall;

      this.verifyToken(req, (valid) => {
        if (valid) {
          //find mapping for call to database function
          if (databaseCallsRef.hasOwnProperty(fcall)) {
            let o = databaseCallsRef[fcall];
            let func = o[0];
            let params = o[1].map((x : string) => { req.body[x] });

            func(...params, (success: boolean, err: string | null, data?: any | null) => {

              let ans = {'success': success, 'error': err, 'data': data};
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(ans));

            });
          } else {
            let ans = {'success': false, 'error': 'Invalid api call'};
            res.setHeader('Content-Type', 'application/json');
            res.status(403);
            res.end(JSON.stringify(ans));
          }
        } else {
          let ans = {'success': false, 'error': 'You are not authenticated'};
          res.setHeader('Content-Type', 'application/json');
          res.status(403);
          res.end(JSON.stringify(ans));
        }
      });
    });

    //
    this.express.use('/', router);
  }

};

export default new App().express;
