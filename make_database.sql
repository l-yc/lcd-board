/* Database reset */

DROP DATABASE IF EXISTS lcdboard;
CREATE DATABASE lcdboard;
USE lcdboard;

/* User setup */

DROP USER IF EXISTS lcdbuser@localhost;
CREATE USER lcdbuser@localhost IDENTIFIED WITH mysql_native_password BY 'DemoPlaceholder1!';
GRANT ALL PRIVILEGES ON *.* TO lcdbuser@localhost;

/* Entities */

CREATE TABLE User (
    username varchar(20),
    expiryDate datetime,
    isGuest boolean,
    PRIMARY KEY (username)
);

CREATE TABLE GuestUser (
    username varchar(20),
    connectionToken varchar(24),
    PRIMARY KEY (username),
    CONSTRAINT GU_FK FOREIGN KEY (username) references User (username) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE RegisteredUser (
    username varchar(20),
    passwordHash binary(60),
    PRIMARY KEY (username),
    CONSTRAINT RU_FK FOREIGN KEY (username) references User (username) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE Room (
    roomID varchar(24),
    name varchar(255),
    isPublic boolean,
    ownerUsername varchar(20),
    PRIMARY KEY (roomID),
    CONSTRAINT R_U_FK FOREIGN KEY (ownerUsername) references User (username) ON UPDATE CASCADE
);

CREATE TABLE ActiveRoom (
    roomID varchar(24),
    persistent boolean,
    popularityRating int,
    PRIMARY KEY (roomID),
    CONSTRAINT AR_FK FOREIGN KEY (roomID) references Room (roomID) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE Whiteboard (
    roomID varchar(24),
    name varchar(255),
    drawingFile varchar(50),
    locked boolean,
    PRIMARY KEY (roomID, name),
    CONSTRAINT WB_R_FK FOREIGN KEY (roomID) references ActiveRoom (roomID) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE Message (
    roomID varchar(24),
    msgID int,
    timestamp datetime,
    contents varchar(255),
    sentByUsername varchar(20),
    PRIMARY KEY (roomID, msgID),
    CONSTRAINT MSG_R_FK FOREIGN KEY (roomID) references ActiveRoom (roomID) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT MSG_U_FK FOREIGN KEY (sentByUsername) references User (username) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE TABLE FavouriteDrawings (
    username varchar(20),
    name varchar(255),
    drawingFile  varchar(50),
    PRIMARY KEY (username, name),
    CONSTRAINT FD_FK FOREIGN KEY (username) references RegisteredUser (username) ON UPDATE CASCADE ON DELETE CASCADE
);

/* multivalued attributes */

CREATE TABLE RegisteredUserConnectionTokens (
    username varchar(20),
    connectionToken varchar(24),
    PRIMARY KEY (username, connectionToken),
    CONSTRAINT RUCT_FK FOREIGN KEY (username) references RegisteredUser (username) ON UPDATE CASCADE ON DELETE CASCADE
);

/* relationships */

CREATE TABLE CurrentJoin (
    username varchar(20),
    roomID varchar(24),
    PRIMARY KEY (username, roomID),
    CONSTRAINT CJ_U_FK FOREIGN KEY (username) references User (username) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT CJ_R_FK FOREIGN KEY (roomID) references Room (roomID) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE PastJoin (
    username varchar(20),
    roomID varchar(24),
    timestamp datetime,
    PRIMARY KEY (username, roomID),
    CONSTRAINT PJ_U_FK FOREIGN KEY (username) references RegisteredUser (username) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT PJ_R_FK FOREIGN KEY (roomID) references Room (roomID) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE FavouriteRooms (
    username varchar(20),
    roomID varchar(24),
    PRIMARY KEY (username, roomID),
    CONSTRAINT FR_U_FK FOREIGN KEY (username) references RegisteredUser (username) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT FR_R_FK FOREIGN KEY (roomID) references Room (roomID) ON UPDATE CASCADE ON DELETE CASCADE
);

/* stored procedures for convenient updates */
DELIMITER ;;
CREATE PROCEDURE updateUserExpiryDate(IN uname varchar(20))
BEGIN
    IF (SELECT isGuest FROM User WHERE username = uname) = TRUE THEN
        UPDATE User SET expiryDate = DATE_ADD(NOW(), interval 3 days) WHERE User = username;
    ELSE
        UPDATE User SET expiryDate = DATE_ADD(NOW(), interval 90 days) WHERE User = username;
    END IF
END;;
DELIMITER ;

DELIMITER ;;
CREATE PROCEDURE verifyConnectionToken(IN uname varchar(20), IN token char(24))
BEGIN
    SET @ans := FALSE;
    SELECT COUNT(username) > 0 as 'result' FROM (
        SELECT username
        FROM GuestUser WHERE username = uname AND connectionToken = token
        UNION
        SELECT username
        FROM RegisteredUserConnectionTokens WHERE username = uname AND connectionToken = token
    ) INTO @ans;

    IF @ans = TRUE THEN
        CALL updateUserExpiryDate(uname);
        IF (SELECT isGuest FROM User WHERE username = uname) = TRUE THEN
            UPDATE User SET expiryDate = DATE_ADD(NOW(), interval 3 days) WHERE User = username;
        ELSE
            UPDATE User SET expiryDate = DATE_ADD(NOW(), interval 90 days) WHERE User = username;
        END IF
    END IF

    SELECT @ans AS 'result';
END;;
DELIMITER ;

DELIMITER ;;
CREATE PROCEDURE recordJoinRoom(IN uname varchar(20), IN rID char(24))
BEGIN
    INSERT IGNORE INTO CurrentJoin VALUES (uname, rID);

    /* add to history */
    INSERT INTO PastJoin VALUES (uname, rID, NOW())
    ON DUPLICATE UPDATE PastJoin SET timestamp = NOW();
END;;
DELIMITER ;

DELIMITER ;;
CREATE PROCEDURE recordDisconnectRoom(IN uname varchar(20), IN rID char(24))
BEGIN
    DELETE FROM CurrentJoin WHERE username = uname AND roomID = rID;

    /* update last join time */
    INSERT INTO PastJoin VALUES (uname, rID, NOW())
    ON DUPLICATE UPDATE PastJoin SET timestamp = NOW();
    /*IF EXISTS (SELECT * FROM PastJoin WHERE username = uname AND roomID = rID) THEN
        UPDATE PastJoin SET timestamp = NOW()
    ELSE
        INSERT INTO PastJoin VALUES (uname, rID, NOW());
    END IF;*/
END;;
DELIMITER ;



/* triggers for derived attributes */

CREATE TRIGGER PopularityRatingUpdateTrigger1
AFTER INSERT
ON PastJoin FOR EACH ROW
UPDATE ActiveRoom
SET popularityRating = popularityRating + 1
WHERE NEW.roomID = ActiveRoom.roomID;

CREATE TRIGGER PopularityRatingUpdateTrigger2
AFTER DELETE
ON PastJoin FOR EACH ROW
UPDATE ActiveRoom
SET popularityRating = popularityRating - 1
WHERE OLD.roomID = ActiveRoom.roomID;

DELIMITER ;;
CREATE TRIGGER PopularityRatingUpdateTrigger3
AFTER UPDATE
ON PastJoin FOR EACH ROW
BEGIN
UPDATE ActiveRoom
SET popularityRating = popularityRating - 1
WHERE OLD.roomID = ActiveRoom.roomID;

UPDATE ActiveRoom
SET popularityRating = popularityRating + 1
WHERE NEW.roomID = ActiveRoom.roomID;
END;;
DELIMITER ;
