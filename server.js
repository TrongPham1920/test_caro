// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());

app.get("/", (req, res) => {
  res.send("Socket.io Ba Cây server is running");
});

const rooms = {}; // roomId -> { socketId: { cards, score } }

function findAvailableRoom() {
  for (const roomId in rooms) {
    if (Object.keys(rooms[roomId]).length === 1) {
      return roomId;
    }
  }
  return null;
}

let roomCounter = 1;

// Bộ bài
const SUITS = ["♠", "♥", "♦", "♣"];
const VALUES = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];

function getRandomCard() {
  const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
  const value = VALUES[Math.floor(Math.random() * VALUES.length)];
  return { suit, value };
}

function getCardPoint(value) {
  if (value === "A") return 1;
  if (["J", "Q", "K"].includes(value)) return 10;
  return parseInt(value);
}

function drawThreeCards() {
  const cards = [];
  while (cards.length < 3) {
    const card = getRandomCard();
    // đảm bảo không trùng bài
    if (!cards.find((c) => c.suit === card.suit && c.value === card.value)) {
      cards.push(card);
    }
  }
  return cards;
}

function calculateScore(cards) {
  const total = cards.reduce((sum, card) => sum + getCardPoint(card.value), 0);
  return total % 10;
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("findRoom", () => {
    let roomId = findAvailableRoom();
    if (!roomId) {
      roomId = `room-${roomCounter++}`;
      rooms[roomId] = {};
    }

    socket.join(roomId);
    rooms[roomId][socket.id] = { cards: null, score: 0 };

    console.log(`User ${socket.id} joined ${roomId}`);
    io.to(roomId).emit("playersUpdate", Object.keys(rooms[roomId]));

    if (Object.keys(rooms[roomId]).length === 2) {
      io.to(roomId).emit("startGame");
    }

    socket.emit("roomJoined", roomId);
  });

  socket.on("draw", ({ roomId }) => {
    if (!rooms[roomId]) return;

    const cards = drawThreeCards();
    const score = calculateScore(cards);

    rooms[roomId][socket.id].cards = cards;
    rooms[roomId][socket.id].score = score;

    const players = Object.keys(rooms[roomId]);

    if (players.length === 2) {
      const [p1, p2] = players;

      const s1 = rooms[roomId][p1].score;
      const s2 = rooms[roomId][p2].score;

      let winner = null;
      if (s1 !== s2) {
        winner = s1 > s2 ? p1 : p2;
      }

      io.to(roomId).emit("roundResult", {
        [p1]: { cards: rooms[roomId][p1].cards, score: s1 },
        [p2]: { cards: rooms[roomId][p2].cards, score: s2 },
        winner,
      });

      // Reset cho vòng tiếp theo
      rooms[roomId][p1].cards = null;
      rooms[roomId][p2].cards = null;
      rooms[roomId][p1].score = 0;
      rooms[roomId][p2].score = 0;
    }
  });

  socket.on("disconnect", () => {
    for (const roomId in rooms) {
      if (rooms[roomId][socket.id]) {
        delete rooms[roomId][socket.id];
        io.to(roomId).emit("playersUpdate", Object.keys(rooms[roomId]));
        if (Object.keys(rooms[roomId]).length === 0) {
          delete rooms[roomId];
        }
      }
    }
    console.log("User disconnected:", socket.id);
  });
});

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`🚀 Ba Cây server running on http://localhost:${PORT}`);
});
