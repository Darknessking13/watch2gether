const { v4: uuidv4 } = require("uuid")

// In-memory storage for rooms (use Redis in production)
const rooms = new Map()

function createRoom(videoId = "") {
  const roomId = uuidv4().substring(0, 8) // Short room ID
  const room = {
    id: roomId,
    videoId: videoId,
    users: new Map(),
    createdAt: new Date(),
    isPlaying: false,
    currentTime: 0,
  }

  rooms.set(roomId, room)
  return roomId
}

function joinRoom(roomId, userId, username) {
  const room = rooms.get(roomId)
  if (!room) {
    return null
  }

  room.users.set(userId, {
    id: userId,
    username: username,
    joinedAt: new Date(),
  })

  return room
}

function leaveRoom(userId) {
  for (const [roomId, room] of rooms.entries()) {
    if (room.users.has(userId)) {
      room.users.delete(userId)

      // If room is empty, mark for cleanup
      if (room.users.size === 0) {
        room.isEmpty = true
      }
      break
    }
  }
}

function getRoomData(roomId) {
  return rooms.get(roomId)
}

function findUserRoom(userId) {
  for (const [roomId, room] of rooms.entries()) {
    if (room.users.has(userId)) {
      return { roomId, room }
    }
  }
  return null
}

function cleanupEmptyRooms() {
  for (const [roomId, room] of rooms.entries()) {
    if (room.users.size === 0) {
      rooms.delete(roomId)
      console.log(`Cleaned up empty room: ${roomId}`)
    }
  }
}

// Cleanup old rooms every 30 minutes
setInterval(
  () => {
    const now = new Date()
    for (const [roomId, room] of rooms.entries()) {
      const roomAge = now - room.createdAt
      const maxAge = 24 * 60 * 60 * 1000 // 24 hours

      if (roomAge > maxAge) {
        rooms.delete(roomId)
        console.log(`Cleaned up old room: ${roomId}`)
      }
    }
  },
  30 * 60 * 1000,
)

module.exports = {
  createRoom,
  joinRoom,
  leaveRoom,
  getRoomData,
  cleanupEmptyRooms,
  findUserRoom, // Export the new function
}
