document.addEventListener("DOMContentLoaded", () => {
  const socket = io("/");
  const videoGrid = document.getElementById("video-grid");
  const myVideo = document.createElement("video");
  myVideo.muted = true;

  const peers = {};
  let myVideoStream;
  let peer;
  let myPeerId = null;

  const shareScreenBtn = document.getElementById("shareScreen");
  let isSharing = false;
  let screenStream;

  const startCallButton = document.getElementById("startCallButton");

  startCallButton.addEventListener("click", () => {
    document.getElementById("startModal").style.display = "none";
    startVideoCall();
  });

  const inviteModal = document.getElementById("inviteModal");
  const inviteInput = document.getElementById("inviteUrl");
  const copyBtn = document.getElementById("copyBtn");
  const closeInvite = document.getElementById("closeInvite");

  document.getElementById("inviteButton").addEventListener("click", () => {
    inviteModal.style.display = "flex";
    inviteInput.value = window.location.href;
    copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
  });

  copyBtn.addEventListener("click", () => {
    inviteInput.select();
    inviteInput.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(inviteInput.value).then(() => {
      copyBtn.innerHTML = '<i class="fas fa-check"></i>';
    });
  });

  closeInvite.addEventListener("click", () => {
    inviteModal.style.display = "none";
  });

  document.getElementById("closeInviteX").addEventListener("click", () => {
    inviteModal.style.display = "none";
  });

  window.addEventListener("click", (e) => {
    if (e.target == inviteModal) {
      inviteModal.style.display = "none";
    }
  });

  function startVideoCall() {
    // For local testing uncomment this and comment other peer object code
    // peer = new Peer(undefined, {
    //   path: '/peerjs',
    //   host: '/',
    //   port: 3030, // CHANGE TO 443 FOR RENDER
    // });

    peer = new Peer(undefined, {
      path: '/peerjs',
      host: '/',
      port: 443,
      secure: true,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          {
            urls: 'turn:global.turn.metered.ca:80',
            username: TURN_USER,
            credential: TURN_PASS
          }
        ]
      }
    });

    navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    })
      .then((stream) => {
        myVideoStream = stream;
        addVideoStream(myVideo, stream);

        peer.on("call", (call) => {
          call.answer(stream);
          const video = document.createElement("video");
          call.on("stream", (userVideoStream) => {
            addVideoStream(video, userVideoStream);
          });
          call.on("close", () => video.remove());
          peers[call.peer] = call;
        });

        socket.on("user-connected", (userId) => {
          setTimeout(() => connectToNewUser(userId, stream), 1000);
        });

        socket.on("user-disconnected", (userId) => {
          if (peers[userId]) {
            peers[userId].close();
            delete peers[userId];
          }
        });
      })
      .catch((error) => {
        console.error("Error accessing media devices:", error);
        alert("Error accessing camera/microphone.");
      });

    peer.on("open", (id) => {
      myPeerId = id;
      socket.emit("join-room", ROOM_ID, id, "User");
    });
  }

  const connectToNewUser = (userId, stream) => {
    const call = peer.call(userId, stream);
    const video = document.createElement("video");
    call.on("stream", (userVideoStream) => {
      addVideoStream(video, userVideoStream);
    });
    call.on("close", () => video.remove());
    peers[userId] = call;
  };

  const addVideoStream = (video, stream) => {
    video.srcObject = stream;
    video.addEventListener("loadedmetadata", () => {
      video.play();
    });

    const totalVideos = videoGrid.getElementsByTagName("video").length;

    if (totalVideos === 0) {
      video.classList.add("floating-video");
      video.style.transform = "rotateY(180deg)";
    } else {
      video.classList.add("full-screen-video");
    }

    video.addEventListener("click", () => {
      if (video.classList.contains("floating-video")) {
        const fullScreenVideo = document.querySelector(".full-screen-video");
        if (fullScreenVideo) {
          fullScreenVideo.classList.remove("full-screen-video");
          fullScreenVideo.classList.add("floating-video");
          video.classList.remove("floating-video");
          video.classList.add("full-screen-video");
        }
      }
    });

    videoGrid.append(video);
  };

  document.getElementById("muteButton").addEventListener("click", () => {
    const enabled = myVideoStream.getAudioTracks()[0].enabled;
    myVideoStream.getAudioTracks()[0].enabled = !enabled;

    const btn = document.getElementById("muteButton");
    if (enabled) {
      btn.classList.add("off");
      btn.innerHTML = `<i class="fas fa-microphone-slash"></i>`;
    } else {
      btn.classList.remove("off");
      btn.innerHTML = `<i class="fas fa-microphone"></i>`;
    }
  });

  document.getElementById("stopVideo").addEventListener("click", () => {
    const enabled = myVideoStream.getVideoTracks()[0].enabled;
    myVideoStream.getVideoTracks()[0].enabled = !enabled;

    const btn = document.getElementById("stopVideo");
    if (enabled) {
      btn.classList.add("off");
      btn.innerHTML = `<i class="fas fa-video-slash"></i>`;
    } else {
      btn.classList.remove("off");
      btn.innerHTML = `<i class="fas fa-video"></i>`;
    }
  });

  document.getElementById("disconnect").addEventListener("click", () => {
    if (peer) peer.destroy();
    socket.emit("disconnect");
    window.location.href = "/";
  });

  const chatWindow = document.getElementById("chatWindow");
  const chatToggleBtn = document.getElementById("toggleChat");
  const container = document.getElementById('emojiPickerContainer');

  chatToggleBtn.addEventListener("click", () => {
    const isHidden = chatWindow.style.display === "none";
    if (isHidden) {
      chatWindow.style.display = "flex";
      chatToggleBtn.classList.add("chat-active");
      document.getElementById("chat_message").focus();
    } else {
      chatWindow.style.display = "none";
      chatToggleBtn.classList.remove("chat-active");
      container.style.display = "none";
    }
  });

  document.getElementById("closeChat").addEventListener("click", () => {
    chatWindow.style.display = "none";
    chatToggleBtn.classList.remove("chat-active");
  });

  shareScreenBtn.addEventListener("click", async () => {
    if (!isSharing) {
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: "always" },
          audio: true
        });

        const screenVideoTrack = screenStream.getVideoTracks()[0];

        for (let key in peers) {
          const sender = peers[key].peerConnection.getSenders().find((s) =>
            s.track.kind === "video"
          );

          if (sender) {
            sender.replaceTrack(screenVideoTrack);
          }
        }

        const myVideoElement = document.querySelector(".floating-video");
        if (myVideoElement) {
          myVideoElement.srcObject = screenStream;
          myVideoElement.classList.add("screen-share-mode");
        }

        isSharing = true;
        shareScreenBtn.classList.add("sharing");
        shareScreenBtn.innerHTML = `<i class="fas fa-stop-circle"></i>`;

        screenVideoTrack.onended = () => {
          stopScreenSharing();
        };

      } catch (err) {
        console.error("Failed to share screen:", err);
      }
    } else {
      stopScreenSharing();
    }
  });

  function stopScreenSharing() {
    if (screenStream) {
      screenStream.getTracks().forEach((track) => track.stop());
    }

    navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    }).then((newStream) => {

      const oldAudioTrack = myVideoStream.getAudioTracks()[0];
      myVideoStream = newStream;

      if (oldAudioTrack && !oldAudioTrack.enabled) {
        myVideoStream.getAudioTracks()[0].enabled = false;
        document.getElementById("muteButton").classList.add("off");
        document.getElementById("muteButton").innerHTML = `<i class="fas fa-microphone-slash"></i>`;
      }

      const newVideoTrack = newStream.getVideoTracks()[0];

      for (let key in peers) {
        const sender = peers[key].peerConnection.getSenders().find((s) =>
          s.track.kind === "video"
        );

        if (sender) {
          sender.replaceTrack(newVideoTrack);
        }
      }

      const myVideoElement = document.querySelector(".floating-video") || document.querySelector("video");

      if (myVideoElement) {
        myVideoElement.srcObject = newStream;
        myVideoElement.classList.remove("screen-share-mode");
      }

      isSharing = false;
      shareScreenBtn.classList.remove("sharing");
      shareScreenBtn.innerHTML = `<i class="fas fa-desktop"></i>`;

      const stopVideoBtn = document.getElementById("stopVideo");
      stopVideoBtn.classList.remove("off");
      stopVideoBtn.innerHTML = `<i class="fas fa-video"></i>`;

    }).catch((err) => {
      console.error("Error restarting camera:", err);
      alert("Could not restart camera. Please refresh the page.");
    });
  }
  const textInput = document.getElementById("chat_message");
  const sendBtn = document.getElementById("sendMsgBtn");

  const sendMessage = () => {
    const msg = textInput.value;
    if (msg.length !== 0) {
      const encryptedMsg = CryptoJS.AES.encrypt(msg, ENCRYPT_KEY).toString();
      socket.emit("message", encryptedMsg);
      textInput.value = "";
    }
  };

  textInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  sendBtn.addEventListener("click", sendMessage);

  socket.on("createMessage", (encryptedMsg, senderId) => {
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedMsg, ENCRYPT_KEY);
      const originalText = bytes.toString(CryptoJS.enc.Utf8);

      if (originalText) {
        const messagesUl = document.getElementById("allMessages");
        const li = document.createElement("li");
        li.classList.add("message");
        const isMe = senderId === myPeerId;
        if (isMe) li.classList.add("self-message");

        li.innerHTML = `
            <b>${isMe ? "You" : "Her"}</b>
            <span>${originalText}</span>
        `;
        messagesUl.append(li);
        const mainChatWindow = document.getElementById("mainChatWindow");
        mainChatWindow.scrollTop = mainChatWindow.scrollHeight;
      }
    } catch (e) {
      console.error("Failed to decrypt message", e);
    }
  });

  const picker = picmo.createPicker({ rootElement: container });
  picker.addEventListener('emoji:select', (selection) => {
    textInput.value += selection.emoji;
    container.style.display = 'none';
    textInput.focus();
  });

  document.getElementById("emojiBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    const isVisible = container.style.display === "block";
    container.style.display = isVisible ? "none" : "block";
  });

  window.addEventListener("click", (e) => {
    if (!document.getElementById("emojiBtn").contains(e.target) && !container.contains(e.target)) {
      container.style.display = "none";
    }
  });
});