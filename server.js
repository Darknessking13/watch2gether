const express = require("express")
const http = require("http")
const socketIo = require("socket.io")
const path = require("path")
const { createRoom, joinRoom, leaveRoom, getRoomData, cleanupEmptyRooms, findUserRoom } = require("./rooms")

const app = express()
const server = http.createServer(app)
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
})

const PORT = process.env.PORT || 3000

// Serve static files from public directory
app.use(express.static(path.join(__dirname, "public")))

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log("User connected:", socket.id)

  // Handle room creation
  socket.on("create-room", (data) => {
    const { username, videoId } = data
    const roomId = createRoom(videoId)
    const room = joinRoom(roomId, socket.id, username)

    socket.join(roomId)
    socket.emit("room-created", { roomId, room })
    io.to(roomId).emit("users-updated", { users: Array.from(room.users.values()) })
    console.log(`Room ${roomId} created by ${username}`)
  })

  // Handle room joining
  socket.on("join-room", (data) => {
    const { roomId, username } = data
    const room = joinRoom(roomId, socket.id, username)

    if (room) {
      socket.join(roomId)
      socket.emit("room-joined", { roomId, room })
      socket.to(roomId).emit("user-joined", { username, userId: socket.id })
      io.to(roomId).emit("users-updated", { users: Array.from(room.users.values()) })
      console.log(`${username} joined room ${roomId}`)
    } else {
      socket.emit("room-error", { message: "Room not found" })
    }
  })

  socket.on("video-play", (data) => {
    const { roomId, currentTime } = data
    const room = getRoomData(roomId)
    if (room) {
      room.isPlaying = true
      room.currentTime = currentTime
      room.lastUpdate = Date.now()
    }
    socket.to(roomId).emit("video-play", { currentTime })
  })

  socket.on("video-pause", (data) => {
    const { roomId, currentTime } = data
    const room = getRoomData(roomId)
    if (room) {
      room.isPlaying = false
      room.currentTime = currentTime
      room.lastUpdate = Date.now()
    }
    socket.to(roomId).emit("video-pause", { currentTime })
  })

  socket.on("video-seek", (data) => {
    const { roomId, currentTime } = data
    const room = getRoomData(roomId)
    if (room) {
      room.currentTime = currentTime
      room.lastUpdate = Date.now()
    }
    socket.to(roomId).emit("video-seek", { currentTime })
  })

  socket.on("video-change", (data) => {
    const { roomId, videoId } = data
    const room = getRoomData(roomId)
    if (room) {
      room.videoId = videoId
      room.currentTime = 0
      room.isPlaying = false
      room.lastUpdate = Date.now()
    }
    socket.to(roomId).emit("video-change", { videoId })
  })

  socket.on("request-sync", (data) => {
    const { roomId } = data
    const room = getRoomData(roomId)
    if (room) {
      // Calculate current time based on last update if playing
      let currentTime = room.currentTime
      if (room.isPlaying && room.lastUpdate) {
        const timePassed = (Date.now() - room.lastUpdate) / 1000
        currentTime += timePassed
      }

      socket.emit("sync-response", {
        videoId: room.videoId,
        currentTime: currentTime,
        isPlaying: room.isPlaying,
      })
    }
  })

  // Handle chat messages
  socket.on("chat-message", (data) => {
    const { roomId, message, username } = data
    const timestamp = new Date().toLocaleTimeString()

    io.to(roomId).emit("chat-message", {
      message,
      username,
      timestamp,
      userId: socket.id,
    })
  })

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id)
    const userRoom = findUserRoom(socket.id)
    if (userRoom) {
      const user = userRoom.room.users.get(socket.id)
      if (user) {
        socket.to(userRoom.roomId).emit("user-left", { username: user.username, userId: socket.id })
      }
    }
    leaveRoom(socket.id)
    cleanupEmptyRooms()
    if (userRoom && userRoom.room.users.size > 0) {
      io.to(userRoom.roomId).emit("users-updated", { users: Array.from(userRoom.room.users.values()) })
    }
  })
})

server.listen(PORT, () => {
  console.log(`Watch2gether server running on port ${PORT}`)
})
