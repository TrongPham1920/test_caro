const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const suits = ["♠", "♣", "♦", "♥"];
const values = [
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

function createDeck() {
  const deck = [];
  for (const s of suits) {
    for (const v of values) {
      deck.push({ suit: s, value: v });
    }
  }
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

const rooms = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("joinRoom", ({ playerName, roomId }) => {
    if (!playerName || !roomId) {
      socket.emit("joinError", "Bạn phải nhập tên và ID phòng.");
      return;
    }
    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: [],
        playerNames: {},
        hands: {},
        status: "waiting",
        actions: {},
        pot: 0,
        bets: {},
        currentTurnIndex: 0,
      };
    }
    const room = rooms[roomId];

    if (room.players.length >= 5) {
      socket.emit("joinError", "Phòng đã đầy, vui lòng chọn phòng khác.");
      return;
    }

    room.players.push(socket.id);
    room.playerNames[socket.id] = playerName;

    socket.join(roomId);
    socket.emit("roomJoined", roomId);

    io.to(roomId).emit(
      "playersUpdate",
      room.players.map((id) => ({ id, name: room.playerNames[id] }))
    );

    // Nếu game đang chơi, gửi bài và lượt hiện tại cho người chơi mới
    if (room.status === "playing") {
      const playerCards = room.hands[socket.id];
      if (playerCards) {
        socket.emit(
          "yourHand",
          playerCards.map((c) => `${c.value}${c.suit}`)
        );
      }
      const currentTurnId = room.players[room.currentTurnIndex];
      socket.emit("turnChanged", {
        playerId: currentTurnId,
        playerName: room.playerNames[currentTurnId],
      });
    }

    if (room.players.length === 5) {
      startGame(roomId);
    }
  });

  socket.on("playerAction", ({ roomId, action }) => {
    const room = rooms[roomId];
    if (!room || room.status !== "playing") return;
    if (socket.id !== room.players[room.currentTurnIndex]) return;

    switch (action) {
      case "up": // úp bài
        room.actions[socket.id] = { action };
        break;
      case "follow": {
        const maxBet = Math.max(...Object.values(room.bets), 0);
        room.bets[socket.id] = maxBet;
        room.actions[socket.id] = { action, bet: maxBet };
        break;
      }
      case "raise": {
        const currentBet = room.bets[socket.id] || 0;
        const raiseAmount = 10;
        const newBet = currentBet + raiseAmount;
        room.bets[socket.id] = newBet;
        room.actions[socket.id] = { action, bet: newBet };
        break;
      }
      case "allin": {
        const allInBet = 100;
        room.bets[socket.id] = allInBet;
        room.actions[socket.id] = { action, bet: allInBet };
        break;
      }
      default:
        return;
    }

    // Cập nhật pot
    room.pot = Object.values(room.bets).reduce((a, b) => a + b, 0);

    io.to(roomId).emit("potUpdated", room.pot);
    io.to(roomId).emit("actionUpdate", {
      player: socket.id,
      action,
      bet: room.bets[socket.id] || 0,
      pot: room.pot,
    });

    // Kiểm tra còn 1 người không úp (đang chơi)
    const alivePlayers = room.players.filter(
      (p) => !(room.actions[p]?.action === "up")
    );

    if (alivePlayers.length === 1) {
      io.to(roomId).emit("gameResult", {
        winnerId: alivePlayers[0],
        pot: room.pot,
        scores: { [alivePlayers[0]]: 0 },
      });
      room.status = "waiting";

      setTimeout(() => startGame(roomId), 7000);
      return;
    }

    // Chuyển lượt
    nextTurn(room);
  });

  socket.on("flipCard", ({ roomId, cardIndex }) => {
    const room = rooms[roomId];
    if (!room || room.status !== "playing") return;
    if (socket.id !== room.players[room.currentTurnIndex]) return;

    io.to(roomId).emit("cardFlipped", { playerId: socket.id, cardIndex });

    nextTurn(room);
  });

  socket.on("disconnect", () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (!room) continue;

      room.players = room.players.filter((p) => p !== socket.id);
      delete room.playerNames[socket.id];
      delete room.actions[socket.id];
      delete room.bets[socket.id];
      delete room.hands[socket.id];

      io.to(roomId).emit(
        "playersUpdate",
        room.players.map((id) => ({ id, name: room.playerNames[id] }))
      );

      if (room.players.length <= 1 && room.status === "playing") {
        // Nếu chỉ còn 1 người chơi thì game kết thúc
        io.to(roomId).emit("gameResult", {
          winnerId: room.players[0] || null,
          pot: room.pot,
          scores: { [room.players[0]]: 0 },
        });
        room.status = "waiting";
      }

      if (room.players.length === 0) {
        delete rooms[roomId];
      }
    }
    console.log("User disconnected:", socket.id);
  });
});

function nextTurn(room) {
  const n = room.players.length;
  if (n === 0) return;

  for (let i = 1; i <= n; i++) {
    // tăng chỉ số lượt đi tiếp theo
    room.currentTurnIndex = (room.currentTurnIndex + 1) % n;
    const nextPlayer = room.players[room.currentTurnIndex];
    if (!(room.actions[nextPlayer]?.action === "up")) {
      // Player này chưa úp bài, lượt chơi của người này
      io.to(Object.keys(rooms).find((key) => rooms[key] === room)).emit(
        "turnChanged",
        {
          playerId: nextPlayer,
          playerName: room.playerNames[nextPlayer],
        }
      );
      return;
    }
  }

  // Nếu vòng lặp trên không tìm ra ai thì game kết thúc hoặc chờ xử lý tiếp
  // Bạn có thể emit event kết thúc vòng chơi ở đây
  io.to(Object.keys(rooms).find((key) => rooms[key] === room)).emit(
    "turnChanged",
    null
  );
}

function startGame(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  room.status = "playing";
  room.actions = {};
  room.pot = 0;
  room.bets = {};
  room.currentTurnIndex = 0;

  const deck = shuffle(createDeck());
  room.hands = dealCards(deck, room.players);

  io.to(roomId).emit("gameStarted", {
    pot: room.pot,
    hands: Object.fromEntries(
      Object.entries(room.hands).map(([player, cards]) => [
        player,
        cards.map((c) => `${c.value}${c.suit}`),
      ])
    ),
    currentTurnId: room.players[room.currentTurnIndex],
  });

  io.to(roomId).emit("turnChanged", {
    playerId: room.players[room.currentTurnIndex],
    playerName: room.playerNames[room.players[room.currentTurnIndex]],
  });
}

function dealCards(deck, players) {
  const hands = {};
  for (const player of players) {
    hands[player] = deck.splice(0, 3);
  }
  return hands;
}

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
