document.addEventListener("DOMContentLoaded", () => {
  const socket = io("/");
  const videoGrid = document.getElementById("video-grid");
  const myVideo = document.createElement("video");
  myVideo.muted = true;

  let user; // Variable to hold the user name
  let myVideoStream;
  let peer; // Moved peer declaration outside to avoid scoping issues

  // Handle starting the call after entering the name
  const startCallButton = document.getElementById("startCallButton");
  startCallButton.addEventListener("click", () => {
    user = document.getElementById("userNameInput").value;
    if (user) {
      document.getElementById("nameModal").style.display = "none"; // Hide the modal
      startVideoCall(); // Proceed to start the video call
    } else {
      alert("Please enter your name to start the call.");
    }
  });

  function startVideoCall() {
    peer = new Peer({
      host: '127.0.0.1',
      port: 3030,
      path: '/peerjs',
    });

    navigator.mediaDevices
      .getUserMedia({
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
        });

        socket.on("user-connected", (userId) => {
          connectToNewUser(userId, stream);
        });

        // Listen for invitation to a new user to join the call
        socket.on("user-invite", (invitedUserId) => {
          console.log(`${invitedUserId} invited to join the call`);
          connectToNewUser(invitedUserId, stream);
        });
      })
      .catch((error) => {
        console.error("Error accessing media devices:", error);
        alert("Error accessing your camera or microphone.");
      });

    peer.on("open", (id) => {
      socket.emit("join-room", ROOM_ID, id, user);
    });
  }

  const connectToNewUser = (userId, stream) => {
    const call = peer.call(userId, stream);
    const video = document.createElement("video");
    call.on("stream", (userVideoStream) => {
      addVideoStream(video, userVideoStream);
    });
  };

  const addVideoStream = (video, stream) => {
    video.srcObject = stream;
    video.addEventListener("loadedmetadata", () => {
      video.play();
      videoGrid.append(video);
    });
  };

  // Event listener for invite button
  document.getElementById("inviteButton").addEventListener("click", () => {
    const inviteLink = `${window.location.href}?room=${ROOM_ID}`;
    prompt("Copy this link to invite others to the call:", inviteLink);

    // Optionally, emit an event to invite a new user via server logic
    // socket.emit('invite-user', { roomId: ROOM_ID });
  });

  // Mute/unmute functionality
  document.getElementById("muteButton").addEventListener("click", () => {
    const enabled = myVideoStream.getAudioTracks()[0].enabled;
    myVideoStream.getAudioTracks()[0].enabled = !enabled;
    document.getElementById("muteButton").innerHTML = enabled
      ? `<i class="fa fa-microphone-slash"></i>`
      : `<i class="fa fa-microphone"></i>`;
  });

  // Stop/start video functionality
  document.getElementById("stopVideo").addEventListener("click", () => {
    const enabled = myVideoStream.getVideoTracks()[0].enabled;
    myVideoStream.getVideoTracks()[0].enabled = !enabled;
    document.getElementById("stopVideo").innerHTML = enabled
      ? `<i class="fa fa-video-slash"></i>`
      : `<i class="fa fa-video"></i>`;
  });

  // Disconnect call functionality
  document.getElementById("disconnect").addEventListener("click", () => {
    if (peer) {
      peer.destroy();
    }
    socket.emit("disconnect");
    window.location.href = "https://www.google.com";
  });
});
