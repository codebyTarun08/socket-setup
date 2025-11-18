import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import Message from "./models/messageModel.js";

dotenv.config();
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

const app = express();

app.use(cors({
  origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
  methods: ["GET", "POST"],
}));

const server = http.createServer(app);

const io = new Server(server, {
  path: "/socket.io",
  transports: ["websocket"],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  cors: {
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    methods: ["GET", "POST"],
  },
});

// Maps identical to Next.js version
const socketRoomsMap = new Map();
const roomUsersMap = new Map();

// ------------------
//   SOCKET.IO LOGIC
// ------------------
io.on("connection", (socket) => {
  console.log("🔌 Connected:", socket.id);

  // JOIN ROOM
  socket.on("join-room", ({ roomId, userId }) => {
    socket.join(roomId);

    // Track socket -> rooms
    const rooms = socketRoomsMap.get(socket.id) || new Set();
    rooms.add(roomId);
    socketRoomsMap.set(socket.id, rooms);

    // Track user -> room presence
    if (!roomUsersMap.has(roomId)) {
      roomUsersMap.set(roomId, new Set());
    }
    roomUsersMap.get(roomId).add(userId);
    socket.userId = userId;

    socket.to(roomId).emit("user-connected", userId);

    // Send online users to new user
    const onlineUsers = Array.from(roomUsersMap.get(roomId)).filter(u => u !== userId);
    if (onlineUsers.length > 0) {
      socket.emit("users-online", { userIds: onlineUsers });
    }
  });

  // PRESENCE
  socket.on("presence-ping", ({ roomId, from }) => {
    socket.to(roomId).emit("presence-ping", { from });
  });

  socket.on("presence-pong", ({ roomId, from }) => {
    socket.to(roomId).emit("presence-pong", { from });
  });

  // ------------------
  //   MESSAGES
  // ------------------
  socket.on("send-message", async ({ roomId, sender, senderId, text = "", imageUrl = null }) => {
    try {
      const type = imageUrl && text ? "mixed" : imageUrl ? "image" : "text";

      const saved = await Message.create({
        bookingId: roomId,
        senderId,
        type,
        text: text || "",
        imageUrl: imageUrl || null,
      });

      io.to(roomId).emit("receive-message", {
        text,
        sender,
        senderId,
        imageUrl,
        messageId: saved._id,
        createdAt: saved.createdAt,
      });

    } catch (err) {
      console.error("Message save error:", err);
      socket.emit("message-error", { error: err.message });
    }
  });

  // ------------------
  //   WEBRTC SIGNALING
  // ------------------

  socket.on("call-request", (data) => socket.to(data.roomId).emit("call-request", data));
  socket.on("call-accept", (data) => socket.to(data.roomId).emit("call-accept", data));
  socket.on("call-reject", (data) => socket.to(data.roomId).emit("call-reject", data));
  socket.on("call-end", (data) => socket.to(data.roomId).emit("call-end", data));

  socket.on("offer", (data) => socket.to(data.roomId).emit("offer", data));
  socket.on("answer", (data) => socket.to(data.roomId).emit("answer", data));

  socket.on("ice-candidate", (data) => {
    if (data?.candidate) {
      socket.to(data.roomId).emit("ice-candidate", data);
    }
  });

  // ------------------
  //   DISCONNECT
  // ------------------
  socket.on("disconnect", () => {
    const rooms = socketRoomsMap.get(socket.id);
    if (rooms) {
      rooms.forEach((roomId) => {
        socket.to(roomId).emit("user-disconnected", { socketId: socket.id });
      });
      socketRoomsMap.delete(socket.id);
    }

    // Remove user from room user map
    if (socket.userId) {
      roomUsersMap.forEach((users, roomId) => {
        if (users.has(socket.userId)) {
          users.delete(socket.userId);
        }
      });
    }

    console.log("❌ Disconnected:", socket.id);
  });
});

// ------------------
//   START SERVER
// ------------------
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`🚀 Socket.IO server running on http://localhost:${PORT}`);
});
