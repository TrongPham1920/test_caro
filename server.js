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

// Quản lý socket
io.on("connection", (socket) => {
  console.log("🟢 New client connected: ", socket.id);

  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    console.log(`🔗 ${socket.id} joined room ${roomId}`);
    io.to(roomId).emit("user-joined", socket.id);
  });

  socket.on("send-message", ({ roomId, message }) => {
    io.to(roomId).emit("receive-message", {
      sender: socket.id,
      message,
    });
  });

  socket.on("disconnect", () => {
    console.log("🔴 Client disconnected: ", socket.id);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
