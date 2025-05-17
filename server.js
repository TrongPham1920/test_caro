// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Cho phép mọi nguồn, bạn có thể chỉ định cụ thể nếu cần
    methods: ["GET", "POST"],
  },
});

app.use(cors());

// Route test
app.get("/", (req, res) => {
  res.send("Socket.io server is running");
});

const rooms = {}; // roomId -> { socketId: { move: null } }

function findAvailableRoom() {
  for (const roomId in rooms) {
    if (Object.keys(rooms[roomId]).length === 1) {
      return roomId;
    }
  }
  return null;
}

let roomCounter = 1;

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("findRoom", () => {
    let roomId = findAvailableRoom();
    if (!roomId) {
      roomId = `room-${roomCounter++}`;
      rooms[roomId] = {};
    }

    socket.join(roomId);
    rooms[roomId][socket.id] = { move: null, score: 0 };

    console.log(`User ${socket.id} joined ${roomId}`);
    io.to(roomId).emit("playersUpdate", Object.keys(rooms[roomId]));

    if (Object.keys(rooms[roomId]).length === 2) {
      io.to(roomId).emit("startGame");
    }

    // Gửi roomId về client để sau này gửi move
    socket.emit("roomJoined", roomId);
  });

  socket.on("move", ({ roomId, move }) => {
    if (!rooms[roomId]) return;
    rooms[roomId][socket.id].move = move;

    const players = Object.keys(rooms[roomId]);
    if (players.length === 2) {
      const [p1, p2] = players;
      const m1 = rooms[roomId][p1].move;
      const m2 = rooms[roomId][p2].move;

      if (m1 && m2) {
        const result = getResult(m1, m2);
        let winner = null;

        if (result === 1) {
          rooms[roomId][p1].score += 1;
          winner = p1;
        } else if (result === 2) {
          rooms[roomId][p2].score += 1;
          winner = p2;
        }

        // Emit kết quả vòng đấu
        io.to(roomId).emit("roundResult", {
          [p1]: { move: m1, score: rooms[roomId][p1].score },
          [p2]: { move: m2, score: rooms[roomId][p2].score },
          winner: result === 0 ? null : winner,
        });

        // Kiểm tra nếu có người đạt 3 điểm
        if (rooms[roomId][p1].score === 3 || rooms[roomId][p2].score === 3) {
          const gameWinner = rooms[roomId][p1].score === 3 ? p1 : p2;

          io.to(roomId).emit("gameOver", {
            winner: gameWinner,
            scores: {
              [p1]: rooms[roomId][p1].score,
              [p2]: rooms[roomId][p2].score,
            },
          });

          // Reset lại điểm cho lượt chơi tiếp theo
          rooms[roomId][p1].score = 0;
          rooms[roomId][p2].score = 0;
        }

        // Reset nước đi
        rooms[roomId][p1].move = null;
        rooms[roomId][p2].move = null;
      }
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

function getResult(p1, p2) {
  if (p1 === p2) return 0;
  if (
    (p1 === "rock" && p2 === "scissors") ||
    (p1 === "scissors" && p2 === "paper") ||
    (p1 === "paper" && p2 === "rock")
  )
    return 1;
  return 2;
}

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
