import express, { Request, Response } from 'express';
import path from 'path';

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
  }

  private mountRoutes(): void {
    const router = express.Router();
    router.get('/', function (req: Request, res: Response) {
      res.render('index', { title: 'test' });
    });

    this.express.use('/', router);
  }
};

export default new App().express;
