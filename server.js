const express = require("express");
const app = express();
const server = require("http").Server(app);
require("dotenv").config();
const { v4: uuidv4 } = require("uuid");
const { ExpressPeerServer } = require("peer");

app.set("view engine", "ejs");
app.use(express.static("public"));

const io = require("socket.io")(server, {
  cors: {
    origin: process.env.NODE_ENV === "production" ? "https://your-app-name.onrender.com" : "*",
    methods: ["GET", "POST"]
  },
});

app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect('https://' + req.headers.host + req.url);
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' wss: https: stun: turn: turns:; media-src 'self' blob:; base-uri 'self'; form-action 'self';");
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=*, microphone=*, display-capture=*');
  next();
});

const peerServer = ExpressPeerServer(server, {
  debug: false,
  path: "/"
});

app.use("/peerjs", peerServer);

app.get("/", (req, res) => {
  res.redirect(`/${uuidv4()}`);
});

app.get("/:room", (req, res) => {
  res.render("room", { roomId: req.params.room });
});

io.on("connection", (socket) => {
  socket.on("join-request", (roomId, authHash) => {
    if (authHash !== process.env.hashed_secret) {
      socket.emit("auth-failed");
      socket.disconnect(true);
      return;
    }

    const room = io.sockets.adapter.rooms.get(roomId);
    const numClients = room ? room.size : 0;

    if (numClients >= 2) {
      socket.emit("room-full");
      socket.disconnect(true);
      return;
    }

    socket.join(roomId);

    const turnConfig = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        {
          urls: process.env.TURN_URL || "turn:global.turn.metered.ca:80",
          username: process.env.TURN_USER,
          credential: process.env.TURN_PASS
        },
        {
          urls: process.env.TURNS_URL || "turns:global.turn.metered.ca:443?transport=tcp",
          username: process.env.TURN_USER,
          credential: process.env.TURN_PASS
        }
      ]
    };

    socket.emit("auth-success", turnConfig);

    socket.on("disconnect", () => {
      socket.to(roomId).emit("user-disconnected");
    });

    socket.on("manual-leave", () => {
      socket.leave(roomId);
      socket.to(roomId).emit("user-disconnected");
    });
  });

  socket.on("peer-ready", (roomId, userId) => {
    socket.to(roomId).emit("user-connected", userId);
  });

  socket.on("message", (message, roomId, userId) => {
    io.to(roomId).emit("createMessage", message, userId);
  });
});

server.listen(process.env.PORT || 3030);