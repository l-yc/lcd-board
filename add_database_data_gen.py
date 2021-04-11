import random

import bcrypt
import base64
import os

usernames = list(set(map(lambda x: x.strip(), """
Amina  
Milford  
Lavenia  
Aundrea  
Joseph  
Tanesha  
Lauretta  
Jacqueline  
Madlyn  
Carmine  
Moira  
Leatha  
Tenisha  
Ara  
Pilar  
Daniel
Amee  
Lynn  
Hayden  
Antoine  
Jamee  
Patricia  
Yasmin  
Luetta  
Carlyn  
Ranee  
Nakisha  
Estell  
Julian  
Aurore  
Krystal  
Keren  
Ora  
Tresa  
Sally  
Nevada  
Ruthe  
Bradly  
Ona  
Delana
Glayds  
Donita  
Florinda  
Flo  
Kathey  
Domenica  
Shonta  
Cassie  
Phebe  
Mai  
""".strip().lower().split("\n"))))

print("Preparing password hashes...")
passwords = list(map(lambda x: x.strip(), """
123456
12345
123456789
password
iloveyou
1234567
rockyou
12345678
abc123
monkey
lovely
654321
qwerty
111111
iloveu
000000
""".strip().lower().split("\n")))
print("Done")

roomnames = list(map(lambda x: x.strip(), """
CS6131 Group 1
tofu
CS Admin Room
fun
testing
imposter
asdf
discovery
nush
funny
aaaa
cs discussion
homework
matcha
lol
abcdefg
testing 123
power
the home
:)
why
home sweet home
going home
programming
no name
untitled
interesting
tofu home
tofuuu
test test
abcd
acid base
mysql bug
timescale db
pure html and css
no bootstrap
best webapp
yes join
come join
join join join
""".strip().split("\n")))

whiteboardnames = list(map(lambda x: x.strip(), """
default
untitled
discussion
meeting
drawing
top secret
job overview
work distribution
summary
place
test
idk
fancy name
draw panel
free draw
""".strip().split("\n")))

drawingnames = list(map(lambda x: x.strip(), """
funny meme
tofu
kewt drawing
happy apple
orange
no context
testing
programming 101
magic tricks
how to get an A in exams
weird gltich
major problem
solution to all problems in life
tips and tricks
trick or treat
how to sleep
mood
""".strip().split("\n")))


messages = list(map(lambda x: x.strip(), """
Lorem ipsum dolor sit amet, consectetur adipiscing elit.
Maecenas interdum tellus ut ipsum pellentesque, vitae interdum nibh commodo.
Nulla quis nunc non magna pulvinar ornare.
Aenean semper enim ut urna ullamcorper laoreet.
Mauris vehicula justo non dui mattis venenatis.
Sed dictum enim ut massa feugiat vulputate.
Sed imperdiet ipsum varius scelerisque eleifend.
Praesent a nunc maximus, ultrices nisi sed, malesuada justo.
Phasellus vulputate odio quis tellus aliquam, vitae posuere sapien efficitur.
Maecenas fringilla sem consequat egestas hendrerit.
Praesent pellentesque justo at nulla sagittis porta.
Etiam lobortis turpis ut arcu sodales, at semper quam blandit.
Duis tempor quam id tortor tempus tincidunt.
Praesent quis diam et est consectetur placerat.
Nullam quis metus commodo, ornare nulla id, condimentum diam.
Ut ultrices augue pulvinar nisl varius, ac sollicitudin purus venenatis.
Nullam vitae sapien non lectus dignissim tempor.
""".strip().split("\n")))

print("---")
print("Preparing to generate data...")
User = []
RegisteredUser = []
GuestUser = []
Room = []
ActiveRoom = []
Whiteboard = []
Message = []
FavouriteDrawings = []
RegisteredUserConnectionTokens = []
CurrentJoin = []
PastJoin = []
FavouriteRooms = []

def genId():
    return base64.b64encode(os.urandom(18)).decode("utf8")
def genToken():
    return base64.b64encode(os.urandom(18)).decode("utf8")
def genFilename():
    f = '%024x' % random.randrange(16**24)
    return f + '.json'


users = []
rusers = []
gusers = []

print("Configuring users and related data...")
random.shuffle(usernames)
for i, u in enumerate(usernames):
    guest = i >= 20
    User.append((u,
                  '2021-04-%02d' % (random.randint(20,30)) if guest else
                  '2021-08-%02d' % (random.randint(1,31)),
                  str(guest).upper()))

    users.append(u)
    if guest:
        GuestUser.append((u, genToken()))
        gusers.append(u)
    else:
        pword = random.choice(passwords)
        RegisteredUser.append((u, bcrypt.hashpw(pword.strip().encode("utf-8"), bcrypt.gensalt()).decode("utf-8")))
        rusers.append(u)
        print(u + ":" + pword)

        random_drawing_names = random.sample(drawingnames, 5)
        for i in range(random.randint(0, 3)):
            FavouriteDrawings.append((u, random_drawing_names[i], genFilename()))

        for _ in range(random.randint(0, 3)):
            RegisteredUserConnectionTokens.append((u, genToken()))

print("Configuring rooms and related data...")
random.shuffle(roomnames)
for i, r in enumerate(roomnames):
    active = i >= 20
    r_id = genId()
    owner = random.choice(usernames)
    Room.append((r_id, r, str((random.randint(0,4) != 0)).upper(), owner))

    pastjoinedusers = []

    for u in set([owner] + random.sample(usernames, random.randint(0,8))):
        if u in rusers:
            PastJoin.append((u,r_id,
                             '2021-03-%02d %02d:%02d:%02d' % (random.randint(1,30),
                                                              random.randint(0,23),
                                                              random.randint(0,59),
                                                              random.randint(0,59))
                             ))
            pastjoinedusers.append(u)
            if active and random.random() >= 0.75:
                CurrentJoin.append((u, r_id))

        elif active and random.random() >= 0.5:
            CurrentJoin.append((u, r_id))

    if active:
        ActiveRoom.append((r_id, str((random.randint(0,4) == 0)).upper(), 0))
        for n in random.sample(whiteboardnames, random.randint(1,3)):
            Whiteboard.append((r_id,n,genFilename(),str((random.randint(0,8) == 0)).upper()))

        msg_i = 0
        dates = []

        for _ in range(20):
            dates.append('2021-03-%02d %02d:%02d:%02d' % (random.randint(1,30),
                                                          random.randint(0,23),
                                                          random.randint(0,59),
                                                          random.randint(0,59)))
        dates = sorted(dates)

        if pastjoinedusers:
            for n in random.sample(whiteboardnames, random.randint(0,7)):
                Message.append((r_id, genId(),
                                dates[msg_i],
                                random.choice(messages), random.choice(pastjoinedusers)))
                msg_i += 1

    for u in random.sample(rusers, 10):
        if random.randint(0,3) == 1:
            FavouriteRooms.append((u, r_id))

print("Finalizing...")

def printValues(label, arr):
    out = "INSERT IGNORE INTO " + label + " VALUES\n" + (
              str(arr)[1:-1]
              .replace("'TRUE'", "TRUE")
              .replace("'FALSE'", "FALSE")
              .replace("), ", "),\n")
          )
    return out

output = ";\n\n".join([
    "USE lcdboard",
    printValues("User", User),
    printValues("GuestUser", GuestUser),
    printValues("RegisteredUser", RegisteredUser),
    printValues("Room", Room),
    printValues("ActiveRoom", ActiveRoom),
    printValues("Whiteboard", Whiteboard),
    printValues("Message", Message),
    printValues("FavouriteDrawings", FavouriteDrawings),
    printValues("RegisteredUserConnectionTokens", RegisteredUserConnectionTokens),
    printValues("CurrentJoin", CurrentJoin),
    printValues("PastJoin", PastJoin),
    printValues("FavouriteRooms", FavouriteRooms)
]) + ";"

with open("add_database_data.sql", "w") as f:
    f.write(output)
