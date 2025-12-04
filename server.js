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
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ws: wss:;");
  
  res.render("room", { roomId: req.params.room });
});

io.on("connection", (socket) => {
  socket.on("join-request", (roomId, userId, authHash) => {
    
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
        }
      ]
    };

    socket.emit("auth-success", turnConfig);

    socket.on("disconnect", () => {
      socket.to(roomId).emit("user-disconnected", userId);
    });

    socket.on("manual-leave", () => {
      socket.leave(roomId);
      socket.to(roomId).emit("user-disconnected", userId);
    });
  });

  socket.on("ready-to-stream", (roomId, userId) => {
    socket.to(roomId).emit("user-connected", userId);
  });

  socket.on("message", (message, roomId, userId) => {
    io.to(roomId).emit("createMessage", message, userId);
  });
});

server.listen(process.env.PORT || 3030);