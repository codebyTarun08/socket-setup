import express from "express";
import { Server } from "socket.io";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import Message from "./messageModel.js";  // Create model below

dotenv.config();

// ----------------------
// EXPRESS + HTTP SERVER
// ----------------------
const app = express();
app.use(cors());
const server = http.createServer(app);

// ----------------------
// MONGODB CONNECTION
// ----------------------
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// ----------------------
// SOCKET.IO SERVER
// ----------------------
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  path: "/socket.io",
  transports: ["websocket"],
});

const roomUsersMap = new Map();

io.on("connection", (socket) => {
  console.log("🔌 New client connected:", socket.id);

  // JOIN ROOM
  socket.on("join-room", ({ roomId, userId }) => {
    socket.join(roomId);
    socket.userId = userId;

    if (!roomUsersMap.has(roomId)) {
      roomUsersMap.set(roomId, new Set());
    }
    roomUsersMap.get(roomId).add(userId);

    socket.to(roomId).emit("user-connected", userId);
  });

  // MESSAGING
  socket.on("send-message", async ({ roomId, senderId, text, imageUrl }) => {
    try {
      const type = imageUrl && text ? "mixed" : imageUrl ? "image" : "text";

      const saved = await Message.create({
        bookingId: roomId,
        senderId,
        text,
        imageUrl,
        type
      });

      io.to(roomId).emit("receive-message", {
        text,
        senderId,
        imageUrl,
        messageId: saved._id,
        createdAt: saved.createdAt
      });
    } catch (error) {
      console.error("Message save error:", error);
    }
  });

  // WEBRTC SIGNALING
  socket.on("call-request", (data) => socket.to(data.roomId).emit("call-request", data));
  socket.on("call-accept", (data) => socket.to(data.roomId).emit("call-accept", data));
  socket.on("call-reject", (data) => socket.to(data.roomId).emit("call-reject", data));
  socket.on("call-end", (data) => socket.to(data.roomId).emit("call-end", data));

  socket.on("offer", (data) => socket.to(data.roomId).emit("offer", data));
  socket.on("answer", (data) => socket.to(data.roomId).emit("answer", data));
  socket.on("ice-candidate", (data) => socket.to(data.roomId).emit("ice-candidate", data));

  socket.on("disconnect", () => {
    console.log("❌ client disconnected:", socket.id);
  });
});

// ----------------------
// START SERVER
// ----------------------
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => console.log(`🚀 Socket server running on port ${PORT}`));
