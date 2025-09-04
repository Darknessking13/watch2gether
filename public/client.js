// Global variables
let socket
let player
let currentRoom = null
let currentUser = null
let isPlayerReady = false
let isSyncing = false

// Import necessary libraries
const io = require("socket.io-client")
const YT = window.YT

// Initialize the app
document.addEventListener("DOMContentLoaded", () => {
  initializeSocketConnection()
  setupEventListeners()
  showScreen("landing")
})

// Socket.io connection
function initializeSocketConnection() {
  socket = io()

  socket.on("connect", () => {
    console.log("Connected to server")
    // Request current video state when reconnecting
    if (currentRoom) {
      socket.emit("request-sync", { roomId: currentRoom })
    }
  })

  socket.on("disconnect", () => {
    console.log("Disconnected from server")
    showSyncStatus("Disconnected", false)
  })

  // Room events
  socket.on("room-created", (data) => {
    currentRoom = data.roomId
    currentUser = Array.from(data.room.users.values())[0]
    joinWatchRoom(data.roomId, data.room)
  })

  socket.on("room-joined", (data) => {
    currentRoom = data.roomId
    currentUser = Array.from(data.room.users.values()).find((u) => u.id === socket.id)
    joinWatchRoom(data.roomId, data.room)
    // Request current video state when joining
    setTimeout(() => {
      socket.emit("request-sync", { roomId: currentRoom })
    }, 1000)
  })

  socket.on("room-error", (data) => {
    alert(data.message)
    showScreen("landing")
  })

  socket.on("user-joined", (data) => {
    addChatMessage("system", `${data.username} joined the room`, new Date().toLocaleTimeString())
  })

  socket.on("user-left", (data) => {
    addChatMessage("system", `${data.username} left the room`, new Date().toLocaleTimeString())
  })

  socket.on("users-updated", (data) => {
    updateUsersList(data.users)
  })

  // Enhanced video synchronization events
  socket.on("video-play", (data) => {
    if (player && isPlayerReady && !isSyncing) {
      isSyncing = true
      const timeDiff = Math.abs(player.getCurrentTime() - data.currentTime)

      // Only seek if time difference is significant (more than 2 seconds)
      if (timeDiff > 2) {
        player.seekTo(data.currentTime, true)
      }

      if (player.getPlayerState() !== YT.PlayerState.PLAYING) {
        player.playVideo()
      }

      showSyncStatus("Playing", true)
      setTimeout(() => {
        isSyncing = false
      }, 1500)
    }
  })

  socket.on("video-pause", (data) => {
    if (player && isPlayerReady && !isSyncing) {
      isSyncing = true
      const timeDiff = Math.abs(player.getCurrentTime() - data.currentTime)

      // Seek to exact position when pausing
      if (timeDiff > 1) {
        player.seekTo(data.currentTime, true)
      }

      if (player.getPlayerState() !== YT.PlayerState.PAUSED) {
        player.pauseVideo()
      }

      showSyncStatus("Paused", true)
      setTimeout(() => {
        isSyncing = false
      }, 1500)
    }
  })

  socket.on("video-seek", (data) => {
    if (player && isPlayerReady && !isSyncing) {
      isSyncing = true
      player.seekTo(data.currentTime, true)
      showSyncStatus("Seeking", true)
      setTimeout(() => {
        isSyncing = false
      }, 2000)
    }
  })

  socket.on("video-change", (data) => {
    if (player && isPlayerReady) {
      loadVideo(data.videoId)
      addChatMessage("system", "Video changed", new Date().toLocaleTimeString())
    }
  })

  // New sync response event
  socket.on("sync-response", (data) => {
    if (player && isPlayerReady && data.videoId) {
      const currentVideoId = player.getVideoData().video_id

      // Load video if different
      if (currentVideoId !== data.videoId) {
        loadVideo(data.videoId)
        return
      }

      // Sync playback state
      isSyncing = true
      player.seekTo(data.currentTime, true)

      if (data.isPlaying && player.getPlayerState() !== YT.PlayerState.PLAYING) {
        player.playVideo()
        showSyncStatus("Synced - Playing", true)
      } else if (!data.isPlaying && player.getPlayerState() !== YT.PlayerState.PAUSED) {
        player.pauseVideo()
        showSyncStatus("Synced - Paused", true)
      }

      setTimeout(() => {
        isSyncing = false
      }, 1500)
    }
  })

  // Chat events
  socket.on("chat-message", (data) => {
    addChatMessage(data.username, data.message, data.timestamp, data.userId === socket.id)
  })
}

// Event listeners setup
function setupEventListeners() {
  // Landing screen events
  document.getElementById("create-room-btn").addEventListener("click", createRoom)
  document.getElementById("join-room-btn").addEventListener("click", joinRoom)

  // Watch screen events
  document.getElementById("change-video-btn").addEventListener("click", changeVideo)
  document.getElementById("leave-room-btn").addEventListener("click", leaveRoom)
  document.getElementById("send-message-btn").addEventListener("click", sendMessage)

  // Enter key handlers
  document.getElementById("chat-input").addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage()
  })

  document.getElementById("video-url-input").addEventListener("keypress", (e) => {
    if (e.key === "Enter") changeVideo()
  })

  // Username input handlers
  document.getElementById("create-username").addEventListener("keypress", (e) => {
    if (e.key === "Enter") createRoom()
  })

  document.getElementById("join-username").addEventListener("keypress", (e) => {
    if (e.key === "Enter") joinRoom()
  })

  document.getElementById("room-id").addEventListener("keypress", (e) => {
    if (e.key === "Enter") joinRoom()
  })
}

// YouTube API functions
function onYouTubeIframeAPIReady() {
  console.log("YouTube API ready")
}

function initializePlayer(videoId = "") {
  if (player) {
    player.destroy()
  }

  player = new YT.Player("youtube-player", {
    // Ensure YT is declared or imported
    height: "100%",
    width: "100%",
    videoId: videoId,
    playerVars: {
      playsinline: 1,
      controls: 1,
      rel: 0,
      modestbranding: 1,
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange,
    },
  })
}

function onPlayerReady(event) {
  isPlayerReady = true
  console.log("Player ready")
  showSyncStatus("Synced", true)

  if (player.getVideoData().video_id) {
    document.getElementById("video-placeholder").style.display = "none"
    updateVideoTitle()
  }
}

function onPlayerStateChange(event) {
  if (!isPlayerReady || isSyncing) return

  const currentTime = player.getCurrentTime()

  switch (event.data) {
    case YT.PlayerState.PLAYING:
      socket.emit("video-play", { roomId: currentRoom, currentTime })
      showSyncStatus("Playing", true)
      break
    case YT.PlayerState.PAUSED:
      socket.emit("video-pause", { roomId: currentRoom, currentTime })
      showSyncStatus("Paused", true)
      break
    case YT.PlayerState.BUFFERING:
      showSyncStatus("Buffering", true)
      break
    case YT.PlayerState.ENDED:
      socket.emit("video-pause", { roomId: currentRoom, currentTime })
      showSyncStatus("Video Ended", true)
      break
  }
}

// Room management functions
function createRoom() {
  const username = document.getElementById("create-username").value.trim()
  const youtubeUrl = document.getElementById("youtube-url").value.trim()

  if (!username) {
    alert("Please enter a username")
    return
  }

  const videoId = extractVideoId(youtubeUrl)
  showScreen("loading")

  socket.emit("create-room", { username, videoId })
}

function joinRoom() {
  const username = document.getElementById("join-username").value.trim()
  const roomId = document.getElementById("room-id").value.trim()

  if (!username || !roomId) {
    alert("Please enter both username and room ID")
    return
  }

  showScreen("loading")
  socket.emit("join-room", { roomId, username })
}

function joinWatchRoom(roomId, roomData) {
  document.getElementById("current-room-id").textContent = roomId
  showScreen("watch")

  // Initialize YouTube player
  initializePlayer(roomData.videoId)

  // Update UI
  updateUsersList(roomData.users)
  updateVideoTitle()

  // Clear chat
  document.getElementById("chat-messages").innerHTML = ""
  addChatMessage("system", "Welcome to the room!", new Date().toLocaleTimeString())
}

function leaveRoom() {
  if (confirm("Are you sure you want to leave the room?")) {
    socket.disconnect()
    socket.connect()
    currentRoom = null
    currentUser = null
    showScreen("landing")

    // Clear inputs
    document.getElementById("create-username").value = ""
    document.getElementById("join-username").value = ""
    document.getElementById("room-id").value = ""
    document.getElementById("youtube-url").value = ""
    document.getElementById("video-url-input").value = ""
  }
}

// Video management functions
function changeVideo() {
  const videoUrl = document.getElementById("video-url-input").value.trim()
  const videoId = extractVideoId(videoUrl)

  if (!videoId) {
    alert("Please enter a valid YouTube URL")
    return
  }

  loadVideo(videoId)
  socket.emit("video-change", { roomId: currentRoom, videoId })
  document.getElementById("video-url-input").value = ""
}

function loadVideo(videoId) {
  if (player && isPlayerReady) {
    try {
      player.loadVideoById(videoId)
      document.getElementById("video-placeholder").style.display = "none"
      showSyncStatus("Loading Video", true)
      setTimeout(updateVideoTitle, 2000)
    } catch (error) {
      console.error("Error loading video:", error)
      showSyncStatus("Error Loading Video", false)
    }
  }
}

function extractVideoId(url) {
  if (!url) return ""

  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/
  const match = url.match(regExp)

  return match && match[2].length === 11 ? match[2] : ""
}

function updateVideoTitle() {
  if (player && isPlayerReady) {
    const videoData = player.getVideoData()
    const title = videoData.title || "Unknown Video"
    document.getElementById("video-title").textContent = title
  }
}

// Chat functions
function sendMessage() {
  const input = document.getElementById("chat-input")
  const message = input.value.trim()

  if (!message) return

  socket.emit("chat-message", {
    roomId: currentRoom,
    message: message,
    username: currentUser.username,
  })

  input.value = ""
}

function addChatMessage(username, message, timestamp, isOwn = false) {
  const chatMessages = document.getElementById("chat-messages")
  const messageDiv = document.createElement("div")
  messageDiv.className = `chat-message ${isOwn ? "own" : ""}`

  const isSystem = username === "system"

  if (isSystem) {
    messageDiv.className = "chat-message system"
  }

  messageDiv.innerHTML = `
        <div class="message-header">
            <span class="message-username">${isSystem ? "System" : username}</span>
            <span class="message-time">${timestamp}</span>
        </div>
        <div class="message-content">${message}</div>
    `

  chatMessages.appendChild(messageDiv)
  chatMessages.scrollTop = chatMessages.scrollHeight
}

// UI helper functions
function showScreen(screenName) {
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.remove("active")
  })
  document.getElementById(`${screenName}-screen`).classList.add("active")
}

function showSyncStatus(status, isConnected) {
  const indicator = document.getElementById("sync-indicator")
  const statusIcon = isConnected ? "🟢" : "🔴"

  // Add different icons for different states
  let stateIcon = ""
  if (status.includes("Playing")) stateIcon = "▶️"
  else if (status.includes("Paused")) stateIcon = "⏸️"
  else if (status.includes("Buffering")) stateIcon = "⏳"
  else if (status.includes("Seeking")) stateIcon = "⏩"
  else if (status.includes("Loading")) stateIcon = "📺"
  else if (status.includes("Error")) stateIcon = "❌"

  indicator.textContent = `${statusIcon} ${stateIcon} ${status}`

  // Add visual feedback classes
  indicator.className = "sync-indicator"
  if (!isConnected || status.includes("Error")) {
    indicator.classList.add("error")
  } else if (status.includes("Buffering") || status.includes("Loading")) {
    indicator.classList.add("loading")
  }
}

function updateUsersList(users = []) {
  const userCount = document.getElementById("user-count")
  const usersList = document.getElementById("users-list")

  userCount.textContent = users.length

  // Clear existing user badges
  usersList.innerHTML = ""

  // Add user badges
  users.forEach((user) => {
    const userBadge = document.createElement("div")
    userBadge.className = "user-badge"
    userBadge.textContent = user.username
    if (user.id === socket.id) {
      userBadge.classList.add("current-user")
    }
    usersList.appendChild(userBadge)
  })
}
