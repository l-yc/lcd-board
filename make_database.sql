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
    ownerUsername varchar(20) NOT NULL,
    PRIMARY KEY (roomID),
    CONSTRAINT R_U_FK FOREIGN KEY (ownerUsername) references User (username) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE ActiveRoom (
    roomID varchar(24),
    persistent boolean,
    popularityRating int DEFAULT 0,
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
    msgID varchar(24),
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
        UPDATE User SET expiryDate = DATE_ADD(NOW(), interval 3 day) WHERE username = uname;
    ELSE
        UPDATE User SET expiryDate = DATE_ADD(NOW(), interval 90 day) WHERE username = uname;
    END IF;
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
    ) t INTO @ans;

    IF @ans = TRUE THEN
        /* auto update expiry, since token has been referenced */
        CALL updateUserExpiryDate(uname);
    END IF;

    SELECT @ans AS 'result';
END;;
DELIMITER ;

DELIMITER ;;
CREATE PROCEDURE recordJoinRoom(IN uname varchar(20), IN rID varchar(24))
BEGIN
    INSERT IGNORE INTO CurrentJoin VALUES (uname, rID);

    /* update last join time */
    IF (SELECT isGuest FROM User WHERE username = uname) = FALSE THEN
        INSERT INTO PastJoin VALUES (uname, rID, NOW())
        ON DUPLICATE KEY UPDATE timestamp = NOW();
    END IF;

END;;
DELIMITER ;

DELIMITER ;;
CREATE PROCEDURE recordDisconnectRoom(IN uname varchar(20), IN rID varchar(24))
BEGIN
    DELETE FROM CurrentJoin WHERE username = uname AND roomID = rID;

    /* update last join time */
    IF (SELECT isGuest FROM User WHERE username = uname) = FALSE THEN
        INSERT INTO PastJoin VALUES (uname, rID, NOW())
        ON DUPLICATE KEY UPDATE timestamp = NOW();
    END IF;

END;;
DELIMITER ;

DELIMITER ;;
CREATE PROCEDURE popularRooms (
    IN uname varchar(20)
)
BEGIN
    SELECT r.roomID, r.name, r.ownerUsername
    FROM Room r JOIN ActiveRoom ar ON r.roomID = ar.roomID
    WHERE
        r.isPublic = TRUE OR
        r.ownerUsername = uname OR
        r.roomID IN (
            SELECT roomID FROM PastJoin pj WHERE pj.username = uname
            UNION
            SELECT roomID FROM FavouriteRooms fvRm WHERE fvRm.username = uname
        )
    ORDER BY popularityRating DESC
    LIMIT 15;
END;;
DELIMITER ;

DELIMITER ;;
CREATE PROCEDURE filterRooms (
    IN uname varchar(20),
    IN roomIDFilter varchar(24),
    IN roomFilter varchar(255),
    IN ownerFilter varchar(20),
    IN whiteboardFilter varchar(255),
    IN public boolean,
    IN active boolean
)
BEGIN
    SELECT r.roomID, r.name, r.isPublic, r.ownerUsername
    FROM Room r
    WHERE r.roomID = roomIDFilter
    UNION
    (
        SELECT r.roomID, r.name, r.isPublic, r.ownerUsername
        FROM Room r
        LEFT JOIN PastJoin pj
            ON r.roomID = pj.roomID
        LEFT JOIN Whiteboard wb
            ON r.roomID = wb.roomID
        WHERE
            (
                isPublic = TRUE OR
                r.ownerUsername = uname OR
                r.roomID IN (
                    SELECT roomID FROM PastJoin pj WHERE pj.username = uname
                    UNION
                    SELECT roomID FROM FavouriteRooms fvRm WHERE fvRm.username = uname
                )
            ) AND (
                IF(roomFilter IS NULL,       TRUE, r.name          LIKE CONCAT('%', roomFilter, '%'))       AND
                IF(ownerFilter IS NULL,      TRUE, r.ownerUsername LIKE CONCAT('%', ownerFilter, '%'))      AND
                IF(whiteboardFilter is NULL, TRUE, wb.name         LIKE CONCAT('%', whiteboardFilter, '%')) AND
                IF(public is NULL,           TRUE, r.isPublic = public)                                     AND
                IF(active IS NULL,           TRUE, active =
                    EXISTS (SELECT * FROM ActiveRoom ar WHERE ar.roomID = r.roomID)
                )
            )
        GROUP BY r.roomID
        ORDER BY IF(r.isPublic, 1, 0), -IFNULL(pj.timestamp,0), r.name, r.ownerUsername
    )
    LIMIT 50;
END;;
DELIMITER ;



/* triggers and events for database */
SET GLOBAL event_scheduler = ON;

/* popularityRating */

/* update on join activity change */
DROP TRIGGER IF EXISTS PopularityRatingUpdateTrigger1;
DROP TRIGGER IF EXISTS PopularityRatingUpdateTrigger2;
DROP TRIGGER IF EXISTS PopularityRatingUpdateTrigger3;

CREATE TRIGGER PopularityRatingUpdateTrigger1
AFTER INSERT
ON PastJoin FOR EACH ROW
UPDATE ActiveRoom
SET popularityRating = popularityRating + 1
WHERE NEW.roomID = ActiveRoom.roomID AND TIMESTAMPDIFF(MONTH, NEW.timestamp, NOW()) <= 3;

CREATE TRIGGER PopularityRatingUpdateTrigger2
AFTER DELETE
ON PastJoin FOR EACH ROW
UPDATE ActiveRoom
SET popularityRating = popularityRating - 1
WHERE OLD.roomID = ActiveRoom.roomID AND TIMESTAMPDIFF(MONTH, OLD.timestamp, NOW()) <= 3;

DELIMITER ;;
CREATE TRIGGER PopularityRatingUpdateTrigger3
AFTER UPDATE
ON PastJoin FOR EACH ROW
BEGIN
UPDATE ActiveRoom
SET popularityRating = popularityRating - 1
WHERE OLD.roomID = ActiveRoom.roomID AND TIMESTAMPDIFF(MONTH, OLD.timestamp, NOW()) <= 3;

UPDATE ActiveRoom
SET popularityRating = popularityRating + 1
WHERE NEW.roomID = ActiveRoom.roomID AND TIMESTAMPDIFF(MONTH, NEW.timestamp, NOW()) <= 3;
END;;
DELIMITER ;

/* automatically refresh popularity rating to not include old past joins */
DROP EVENT IF EXISTS PopularityRatingUpdateEvent;

CREATE EVENT PopularityRatingUpdateEvent
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_TIMESTAMP
ENDS CURRENT_TIMESTAMP + INTERVAL 1 YEAR
DO
    UPDATE ActiveRoom SET popularityRating = (
        SELECT count(*) FROM PastJoin
        WHERE ActiveRoom.roomID = PastJoin.roomID AND TIMESTAMPDIFF(MONTH, PastJoin.timestamp, NOW()) <= 3
    );

/* automatic cleanup of old users */
DROP EVENT IF EXISTS OldUserCleanupEvent;

CREATE EVENT OldUserCleanupEvent
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_TIMESTAMP
ENDS CURRENT_TIMESTAMP + INTERVAL 1 YEAR
DO
    DELETE FROM User WHERE NOW() > expiryDate;