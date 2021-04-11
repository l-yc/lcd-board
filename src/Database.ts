import mysql, { Connection, Query, MysqlError } from 'mysql';
import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { RoomInfo, RoomMessage, Whiteboard, DrawData } from './types'

type DatabaseReturnResponse<T> = (success: boolean, err: string | null, data: T | null) => void;
type TokenReturnResponse       = (success: boolean, err: string | null, token: string | null) => void;
type SuccessReturnResponse     = (success: boolean, err: string | null) => void; 
type CompletionReturnResponse  = (success: boolean, err: string | null) => void;
type ReadQueueResponse         = (data: any[], block: (c: boolean) => void) => void;

class Database {

  public connection: Connection;
  constructor() {
    this.connection = mysql.createConnection({
      host     : 'localhost',
      user     : 'lcdbuser',
      password : 'DemoPlaceholder1!',
      database : 'lcdboard'
    });

    this.connection.connect((err: Error) => {
      if (err) {
        console.error('error connecting: ' + err.stack);
        return;
      }

      console.log('connected as id ' + (this.connection.threadId)?.toString());
    });
    let dir = './drawingFiles';

    if (!fs.existsSync(dir)){
      fs.mkdirSync(dir);
    }
  }

  //
  // MARK : - Database Operation Helpers
  //
  private performRead(command: [string, any[]], handler: DatabaseReturnResponse<any[]>) {
    this.connection.query(command[0], command[1], (err, rows) => {
      console.log('- read query -', command);
      console.log('- return response -', rows);
      if (err) console.log(err);

      handler(err == null, err ? 'A database error occured. Check backend logs for details.' : null, rows);
    });
  }
  private performReads(commands: [string, any[]][], readHandlers: ReadQueueResponse[], completionHandler: CompletionReturnResponse) {
    console.log('- running read queries -', commands);
    let queueI = 0;
    let toRun = () => this.connection.query(commands[queueI][0], commands[queueI][1], (err, rows) => {
      if (err) {
        console.log('- read error -', err);
        completionHandler(false, err ? 'A database error occured. Check backend logs for details.' : null);
        return;
      }

      readHandlers[queueI](rows, (shouldContinue) => {
        queueI++;
        if (queueI < commands.length && shouldContinue) {
          toRun();
        } else {
          completionHandler(shouldContinue, null);
        }
      });
    });

  }

  private performWriteTransaction(commands: [string, any[]][], handler: SuccessReturnResponse) {
    console.log('- running write queries -', commands);

    let queueI = 0;

    let rollback = (err: MysqlError) => {
      this.connection.rollback(() => {
        console.log('- write error -', err);
        handler(false, 'A database error occured. Check backend logs for details.');
      });
    };
    let commitHandler = (err: MysqlError) => {
      if (err) rollback(err);
      else handler(true, null);
    };


    let toRun = () => this.connection.query(commands[queueI][0], commands[queueI][1], (err, rows) => {
      if (err) {
        rollback(err); return;
      }
      queueI++;
      if (queueI < commands.length) {
        toRun();
      } else {
        this.connection.commit(commitHandler);
      }
    });

    this.connection.beginTransaction((err) => {
      if (err) {
        console.log(err);
        handler(false, 'A database error occured. Check backend logs for details.');
      } else if (commands.length > 0) {
        toRun();
      } else {
        this.connection.commit(commitHandler);
      };
    });

  }

  //
  // USERS
  //
  public login(username: string, password: string, handler: TokenReturnResponse) {
    this.performRead(
      ["SELECT passwordHash FROM RegisteredUser WHERE username = ?", [username]],
      (_, e, rows) => {
        if (rows && rows.length > 0) {
          let hash = rows[0]['passwordHash'].toString('utf8');
          console.log(hash);
          bcrypt.compare(password, hash, (err, res) => {
            if (err) {
              console.log(err);
            }

            if (res) {
              let token = this.generateLoginToken();

              this.performWriteTransaction([
                ["INSERT INTO RegisteredUserConnectionTokens VALUES (?, ?);", [username, token]],
                ["CALL updateUserExpiryDate(?);", [username]]
              ], (success, error) => {
                handler(success, error, token);
              });

            } else {
              handler(false, e || 'The username or password is incorrect.', null);
            }
          });
        } else {
          handler(false, e || 'The username or password is incorrect.', null);
        }
      }
    );
  }

  public register(username: string, password: string, handler: TokenReturnResponse) {
    const passwordHash = bcrypt.hashSync(password, 10);
    this.performRead(
      ["SELECT u.isGuest, gu.connectionToken as 'guestConnectionToken' FROM User u " +
        "LEFT JOIN GuestUser gu ON u.username = gu.username " +
        "WHERE u.username = ?;", [username]],
      (s, e, rows) => {
        if (rows && (rows.length == 0 ||
                     (rows[0]['isGuest'] && !rows[0]['guestConnectionToken']))
           ) {
          let token = this.generateLoginToken();

          this.performWriteTransaction([
            ["INSERT INTO User VALUES (?, NULL, FALSE) ON DUPLICATE KEY UPDATE isGuest=FALSE;", [username]],
            ["INSERT INTO RegisteredUser VALUES (?, ?);", [username, passwordHash]],
            ["INSERT INTO RegisteredUserConnectionTokens VALUES (?, ?);", [username, token]],
            ["DELETE FROM GuestUser WHERE username = ?;", [username]],
            ["CALL updateUserExpiryDate(?)", [username]]
          ], (success, error) => {
            handler(success, error, token);
          });
          return;

        } else {
          handler(false, 'Username taken.', null);
        }
      });
  }

  public logout(username: string, token: string, handler: SuccessReturnResponse) {
    this.performRead(
      ["SELECT isGuest FROM User WHERE username = ?", [username]],
      (s, e, rows) => {
        if (rows && rows.length > 0) {

          let isGuest = rows[0]['isGuest'] as boolean;
          this.performWriteTransaction([
            isGuest ?
              ["UPDATE GuestUser SET connectionToken = NULL WHERE username = ? AND connectionToken = ?", [username, token]] :
              ["DELETE FROM RegisteredUserConnectionTokens WHERE username = ? AND connectionToken = ?", [username, token]],
            ["CALL updateUserExpiryDate(?);", [username]]
          ], (success, error) => {
            handler(success, error);
          });

        } else {
          handler(false, 'Username does not exist.');
        }
      }
    );
  }

  public registerGuest(username: string, handler: TokenReturnResponse) {
    this.performRead(
      ["SELECT * FROM User WHERE username = ?", [username]],
      (s, e, rows) => {
        if (rows?.length == 0) {

          let token = this.generateLoginToken();

          this.performWriteTransaction([
            ["INSERT INTO User VALUES (?, NULL, TRUE); ", [username]],
            ["INSERT INTO GuestUser VALUES (?, ?);", [username, token]],
            ["CALL updateUserExpiryDate(?);", [username]]
          ], (success, error) => {
            handler(success, error, token);
          });
          return;

        } else {
          this.performRead(
            ["SELECT username, connectionToken FROM GuestUser WHERE username = ?", [username]],
            (s, e, rows) => {
              if (rows && rows.length > 0) {
                if (rows[0]['connectionToken'] == null) {
                  let token = this.generateLoginToken();
                  this.performWriteTransaction([
                    ["CALL updateUserExpiryDate(?);", [username]],
                    ["UPDATE GuestUser SET connectionToken = ? WHERE username = ?", [token, username]]
                  ], (success, error) => {
                    handler(success, error, token);
                  });
                } else {
                  handler(false, e || 'Username taken by another guest session.', null);
                }
              } else {
                handler(false, e || 'Username taken by a registered account.', null);
              }
            });

        }
      });

  }

  private generateLoginToken(): string {
    return crypto.randomBytes(18).toString('base64');
  }

  public verifyLoginToken(username: string, token: string, handler: SuccessReturnResponse) {
    this.performRead(
      ["CALL verifyConnectionToken(?, ?);", [username, token]],
      (s, e, rows) => {
        if (rows && rows[0] && rows[0].length > 0) {
          let result = rows[0][0]["result"];
          handler(result, null);
        } else {
          handler(false, e || 'Invalid login session.');
        }
      }
    );
  }

  //
  // ROOMS
  //
  private generateId(): string {
    return crypto.randomBytes(18).toString('base64');
  }

  public createRoom(username: string, name: string, handler: DatabaseReturnResponse<RoomInfo>) {
    let room: RoomInfo = {
      id:           this.generateId(),
      users:        [],
      whiteboards:  [{name: 'default', locked: false}],
      displayName:  name,
      isPublic:     true,
      owner:        username,
      isActive:     true,
      isPersistent: false,
    };
    this.saveRoomInfo(room, (s, e) => {
      this.createWhiteboard(room.id, 'default', (s2, e2, _) => {
        if (!s2) room.whiteboards = [];
        handler(s, e, s ? room : null);
      });
    });
  }

  public retrieveRoomInfo(roomId: string, handler: DatabaseReturnResponse<RoomInfo>) {
    this.performRead(
      [
        "SELECT r.roomID, r.name as 'name', isPublic, ownerUsername, (ar.roomID IS NOT NULL) as 'isActive' , persistent, popularityRating, w.name as 'whiteboardName', w.locked " +
          "FROM Room r LEFT JOIN ActiveRoom ar ON r.roomID = ar.roomID " +
          "LEFT JOIN Whiteboard w ON r.roomID = w.roomID " +
          "WHERE r.roomID = ?", [roomId]
      ],
      (s, e, rows) => {
        if (rows && rows.length > 0) {
          let roomInfo: RoomInfo = {
            id:           rows[0]['roomID'] as string,
            users:        [],
            whiteboards:  rows.map((x: any) => { return {name: x['whiteboardName'], locked: x['locked']} }),
            displayName:  rows[0]['name'] as string,
            isPublic:     rows[0]['isPublic'] as boolean,
            owner:        rows[0]['ownerUsername'] as string,
            isActive:     rows[0]['isActive'] as boolean
          }
          if (roomInfo.isActive) {
            roomInfo.isPersistent = rows[0]['persistent'] as boolean,
            roomInfo.popularity = rows[0]['popularityRating'] as number
          }
          if (roomInfo.whiteboards.length == 1 && roomInfo.whiteboards[0].name == null) {
            roomInfo.whiteboards = []
          }

          handler(true, null, roomInfo);
        } else {
          handler(false, e || 'Room does not exist.', null);
        }
      }
    );
  }

  public saveRoomInfo(room: RoomInfo, handler: SuccessReturnResponse) {
    let queries: [string, any[]][] = [
      [ "INSERT INTO Room VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = ?, isPublic = ?, ownerUsername = ?" ,
        [room.id, room.displayName, room.isPublic, room.owner,
          room.displayName, room.isPublic, room.owner] ]
    ]

    if (room.isActive) {
      queries.push(
        [ "INSERT INTO ActiveRoom VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE persistent = ?" ,
            [room.id, room.isPersistent || false, room.isPersistent || false] ]
      )
    } else {
      queries.push(
        [ "DELETE FROM ActiveRoom WHERE roomID = ?" ,
            [room.id] ]
      )
    }

    this.performWriteTransaction(queries, handler);
  }

  public deleteRoomWithInfo(roomId: string, handler: SuccessReturnResponse) {
    this.performWriteTransaction([
      ["DELETE FROM Room WHERE roomID = ?", [roomId]]
    ], handler);
  }

  public retrieveOwnerRoomList(username: string, handler: DatabaseReturnResponse<{roomId: string, displayName: string, owner: string}[]>) {
    this.performRead([
      "SELECT roomID, name, ownerUsername FROM Room r WHERE ownerUsername = ?",
      [username]
    ], (s, e, rows) => {
      if (s && !e && rows) {
        let returnList = rows.map((row: any) => {
          return {roomId: row["roomID"], displayName: row["name"], owner: row["ownerUsername"]};
        });
        handler(true, null, returnList);
      } else {
        handler(s, e, null);
      }
    });
  }
  public retrievePopularRoomList(username: string, handler: DatabaseReturnResponse<{roomId: string, displayName: string, owner: string}[]>) { 
    this.performRead([
      "CALL popularRooms(?);", [username]
    ], (s, e, rows) => {
      if (s && !e && rows) {
        let returnList = rows[0].map((row: any) => {
          return {roomId: row["roomID"], displayName: row["name"], owner: row["ownerUsername"]};
        });
        handler(true, null, returnList);
      } else {
        handler(s, e, null);
      }
    });
  }

  public retrieveRoomSearchResults(
    username: string,
    queryParams: {
      roomId?: string,
      roomName?: string,
      owner?: string,
      whiteboardName?: string,
      isPublic?: boolean
      isActive?: boolean
    },
    handler: DatabaseReturnResponse<{
      roomId: string, displayName: string, owner: string
    }[]>) {


      this.performRead(
        [
          "CALL filterRooms(?,?,?,?,?,?,?)",
          [
            username,
            queryParams.roomId || null,
            queryParams.roomName || null,
            queryParams.owner || null,
            queryParams.whiteboardName || null,
            queryParams.isPublic === undefined ? null : queryParams.isPublic,
            queryParams.isActive === undefined ? null : queryParams.isActive
          ]
        ],
        (s, e, rows) => {
          if (s && !e && rows) {
            let returnList = rows[0].map((row: any) => {
              return {roomId: row["roomID"], displayName: row["name"], owner: row["ownerUsername"]};
            });
            handler(true, null, returnList);
          } else {
            handler(s, e, null);
          }
        }
      );

  }

  //
  // ROOM MESSAGES
  //
  public prepareRoomMessage(message: RoomMessage): RoomMessage {
     message.id = message.id || this.generateId();
     return message;
  }

  public addRoomMessage(message: RoomMessage, handler: SuccessReturnResponse) {
    this.prepareRoomMessage(message);
    this.performWriteTransaction(
      [[ "INSERT INTO Message VALUES (?, ?, ?, ?, ?);", [message.roomId, message.id, message.timestamp, message.contents, message.originUsername ]]],
      handler
    );
  }

  public retrieveRoomMessages(roomId: string, between: [Date, Date] | null, handler: DatabaseReturnResponse<RoomMessage[]>) {
    this.performRead(
      [
        "SELECT roomID, msgID, timestamp, contents, sentByUsername FROM Message" +
          (between ? "WHERE timestamp BETWEEN ? AND ?;" : ";"),
        between ? [between[0], between[1]] : []
      ],
      (s, e, rows) => {
        let messageList = rows?.map((x: any) => {
          return {
            id: x['msgID'],
            roomId: x['roomID'],
            timestamp: x['timestamp'],
            originUsername: x['sentByUsername'],
            contents: x['contents']
          }
        }) as RoomMessage[] | null;

        handler(s, e, messageList);
      }
    );
  }

  //
  // DRAWING FILES
  //
  private initDrawingFile(data: DrawData[] | null, handler: (filename: string | null) => void) {
    let filename = crypto.randomBytes(9).toString('hex') + '.json';
    fs.writeFile('drawingFiles' + path.sep + filename, JSON.stringify(data || []), (err) => {
      if (err) console.log(err);
      handler(err ? null : filename);
    });
  }

  private updateDrawingFile(filename: string, data: DrawData[], handler: (success: boolean) => void) {
    fs.writeFile('drawingFiles' + path.sep + filename, JSON.stringify(data), (err) => {
      if (err) console.log(err);
      handler(err == null);
    });
  }

  private retrieveDrawingFile(filename: string | null | undefined, handler: (data: DrawData[]) => void) {
    if (!filename) { handler([]); return; }
    fs.readFile('drawingFiles' + path.sep + filename, 'utf8', (err, data) => {
      if (err) console.log(err);
      handler(err ? [] : JSON.parse(data));
    });
  }

  private deleteDrawingFile(filename: string, handler: (success: boolean) => void) {
    fs.unlink('drawingFiles' + path.sep + filename, (err) => {
      if (err) console.log(err);
      handler(err == null);
    });
  }

  //
  // WHITEBOARDS
  //
  public createWhiteboard(roomId: string, name: string, handler: DatabaseReturnResponse<Whiteboard>) {

    let failHandler = (err: string) => {
      handler(false, err, null);
    }

    this.performRead(
      ["SELECT * FROM Whiteboard WHERE roomID = ? AND name = ?", [roomId, name]],
      (s, e, rows) => {
        if (rows?.length == 0) {
          this.initDrawingFile(null, (filename) => {

            if (!filename) {
              failHandler('file creation failed'); return;
            }

            let whiteboard: Whiteboard = {
              roomId: roomId,
              name: name,
              locked: false,
              filename: filename,
              drawDataList: []
            };

            this.performWriteTransaction(
              [["INSERT INTO Whiteboard VALUES (?, ?, ?, ?)", [roomId, name, filename, false]]],
              (s, e) => {
                if (e) {
                  this.deleteDrawingFile(filename, (s) => {});
                }
                handler(s, e, s ? whiteboard : null);
              }
            );

          });
        } else {
          failHandler(e || 'whiteboard already exists');
        }
      }
    );

  }

  public retrieveWhiteboard(roomId: string, name: string, handler: DatabaseReturnResponse<Whiteboard>) {
    this.performRead(
      ["SELECT * FROM Whiteboard WHERE roomID = ? AND name = ?", [roomId, name]],
      (s, e, rows) => {
        if (rows && rows.length > 0) {
          let whiteboard: Whiteboard = {
            roomId: rows[0]['roomID'] as string,
            name:   rows[0]['name'] as string,
            locked: rows[0]['locked'] as boolean,
            filename: rows[0]['drawingFile'] as string,
            drawDataList: []
          }
          this.retrieveDrawingFile(whiteboard.filename, (data) => {
            if (data) whiteboard.drawDataList = data;
            handler(true, data === null ? 'error retrieving drawing file' : null, whiteboard);
          });
        } else {
          handler(false, e || 'whiteboard does not exist', null);
        }
      }
    );
  }

  public updateWhiteboard(oldName: string, whiteboard: Whiteboard, handler: SuccessReturnResponse) {
    let failHandler = (err: string) => {
      handler(false, err);
    }

    this.performRead(
      ["SELECT * FROM Whiteboard WHERE roomID = ? AND name = ?", [whiteboard.roomId, whiteboard.name]],
      (s, e, rows) => {
        if (rows && rows.length > 0 && rows[0]['drawingFile'] == whiteboard.filename && whiteboard.filename) {


          if (whiteboard.locked != rows[0]['locked']) {
            //update locked state if needed
            this.performWriteTransaction(
              [["UPDATE Whiteboard SET name = ?, locked = ? WHERE roomID = ? AND name = ?", [whiteboard.name, whiteboard.locked, whiteboard.roomId, oldName]]],
              (s, e) => {
                if (!s) {
                  failHandler(e || 'whiteboard lock toggle failed')
                  return;
                }
              }
            );
          }

          if (rows[0]['locked'] == false || !whiteboard.locked) {
            // save drawing data if it either is originaly unlocked (currently switched to locked or not doesn't matter)
            // or it is now unlocked (originally locked or not doesn't matter)

            this.updateDrawingFile(whiteboard.filename, whiteboard.drawDataList, (success) => {
              if (!success) {
                failHandler('file creation failed'); return;
              }
            });

          }

          handler(true, null);

        } else {
          failHandler(e || 'whiteboard input is invalid');
        }
      }
    );
  }

  public deleteWhiteboard(roomId: string, name: string, handler: SuccessReturnResponse) {
    this.performWriteTransaction(
      [
        ['DELETE FROM Whiteboard WHERE roomId = ? AND name = ?', [roomId, name]]
      ],
      handler
    );
  }

  //
  // FAVOURITE DRAWINGS
  //
  public addFavouriteDrawing(username: string, name: string, whiteboard: Whiteboard, handler: SuccessReturnResponse) {
    this.initDrawingFile(whiteboard.drawDataList, (filename) => {
      this.performRead([
        "SELECT * FROM FavouriteDrawings WHERE username = ? AND name = ?;", [username, name]
      ], (s, e, rows) => {
        if (rows && rows.length > 0) {
          handler(false, 'Another favourite drawing with the given name exists. Please use a different name.');
          return;
        }

        this.performWriteTransaction([
          ["INSERT INTO FavouriteDrawings VALUES (?, ?, ?);", [username, name, filename]]
        ], handler);
      }) ;
    });
  }

  public retrieveFavouriteDrawing(username: string,  name: string, handler: DatabaseReturnResponse<DrawData[]>) {
    this.performRead([
      "SELECT filename FROM FavouriteDrawings WHERE username = ? AND name = ?", [username, name]
    ], (s, e, rows) => {
      if (rows && rows.length > 0) {
        let filename = rows[0]["filename"]
        this.retrieveDrawingFile(filename, (data) => {
          handler(data != null, data === null ? 'Cannot retrieve drawing file': null, data);
        })
      } else {
        handler(false, e || 'Invalid drawing name', null);
      }
    });
  }

  public deleteFavouriteDrawing(username: string, name: string, handler: SuccessReturnResponse) {
    this.performRead([
      "SELECT filename FROM FavouriteDrawings WHERE username = ? AND name = ?", [username, name]
    ], (s, e, rows) => {
      if (rows && rows.length > 0) {
        let filename = rows[0]["filename"]
        this.deleteDrawingFile(filename, (sFileDel) => {
          this.performWriteTransaction([
            ["DELETE FROM FavouriteDrawings WHERE username = ? AND name = ?", [username, name]]
          ], (sDbDel, e) => {
            handler(sFileDel && sDbDel, e || (sFileDel && sDbDel ? null : 'Deletion of drawing file or database entry failed'));
          });
        })
      } else {
        handler(false, e || 'Invalid drawing name');
      }
    });
  }

  public retrieveFavouriteDrawingList(username: string, handler: DatabaseReturnResponse<string[]>) {
    this.performRead([
      "SELECT name FROM FavouriteDrawings WHERE username = ?", [username]
    ], (s, e, rows) => {
      if (s && !e && rows) {
        let returnList = rows.map((x: any) => {
          return x["name"] as string;
        });
        handler(true, null, returnList);
      } else {
        handler(s, e, null);
      }
    });
  }

  //
  // FAVOURITE ROOMS
  //
  public addFavouriteRoom(username: string, roomId: string, handler: SuccessReturnResponse) {
    this.performWriteTransaction([
      ["INSERT IGNORE INTO FavouriteRooms VALUES (?, ?);", [username, roomId]]
    ], handler);
  }

  public isFavouriteRoom(username: string, roomId: string, handler: DatabaseReturnResponse<boolean>) {
    this.performRead([
      "SELECT EXISTS(SELECT * FROM FavouriteRooms WHERE username = ? AND roomID = ?) as 'results'",
      [username, roomId]
    ], (s, e, rows) => {
      if (s && rows) {
        handler(s, e, !!rows[0]['results']);
      } else {
        handler(s && rows != null, e, null);
      }
    });
  }

  public deleteFavouriteRoom(username: string, roomId: string, handler: SuccessReturnResponse) {
    this.performWriteTransaction([
      ["DELETE FROM FavouriteRooms WHERE username = ? AND roomID = ?;", [username, roomId]]
    ], handler);
  }

  public retrieveFavouriteRoomList(username: string, handler: DatabaseReturnResponse<{roomId: string, displayName: string, owner: string}[]>) {
    this.performRead(
      [
        "SELECT roomID, name, ownerUsername FROM FavouriteRooms NATURAL JOIN Room " +
          "WHERE username = ?", [username]
      ],
      (s, e, rows) => {
        if (s && !e && rows) {
          let returnList = rows.map((row: any) => {
            return {roomId: row["roomID"], displayName: row["name"], owner: row["ownerUsername"]};
          });
          handler(true, null, returnList);
        } else {
          handler(s, e, null);
        }
      }
    );
  }

  //
  // JOINING ROOMS
  //
  // There's no real need to know if it's done,
  // as the connection is mostly managed by the server rather than the database.
  //
  public recordJoinRoom(username: string, roomId: string, handler: SuccessReturnResponse) {
    this.performWriteTransaction([
      ["CALL recordJoinRoom(?, ?);", [username, roomId]],
    ], handler);
  }

  public recordDisconnectRoom(username: string, roomId: string, handler: SuccessReturnResponse) {
    this.performWriteTransaction([
      ["CALL recordDisconnectRoom(?,?);", [username, roomId]]
    ], handler);
  }

  public deletePastJoinedRoom(username: string, roomId: string, handler: SuccessReturnResponse) {
    this.performWriteTransaction([
      ["DELETE FROM PastJoin WHERE username = ? AND roomID = ?;", [username, roomId]]
    ], handler);
  }
 public retrievePastJoinedRooms(username: string, handler: DatabaseReturnResponse<{roomId: string, displayName: string, owner: string, joinTimestamp: Date}[]>) {
    this.performRead(
      [
        "SELECT roomID, name, ownerUsername, timestamp FROM PastJoin NATURAL JOIN Room " +
          "WHERE username = ? ORDER BY timestamp DESC", [username]
      ],
      (s, e, rows) => {
        let result = rows?.map((x: any) => {
          return {
            roomId: x['roomID'] as string,
            displayName: x['name'] as string,
            owner: x['ownerUsername'] as string,
            joinTimestamp: x['timestamp'] as Date
          }
        })
        handler(s, e, result || null)
      }
    )
  }

  public clearPastJoinedRooms(username: string, handler: SuccessReturnResponse) {
    this.performWriteTransaction([
      ["DELETE FROM PastJoin WHERE username = ?;", [username]]
    ], handler);
  }

  //
  // TESTING
  //
  public testDump(handler: (results: Array<string>) => void) {
    this.connection.query("SELECT username FROM User", (err, rows) => {
      handler(rows.map(function (x: any) { return x["username"]; }));
    });
  }
}
export default new Database();
