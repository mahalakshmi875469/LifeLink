
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js";

import {
    getFirestore,
    collection,
    addDoc,
    onSnapshot,
    updateDoc,
    doc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";

import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";

import {
    DirectChannel,
    SendTextMessageParams,
    MessageHandler,
    ConnectionStatusHandler
} from "@nexconn/chat";

import { NCEngine } from "./nexconn.js";


// FIREBASE CONFIG
const firebaseConfig = {
    apiKey: "AIzaSyAFqeXQANl74mc5hDa-WbwOV3dzWcEnD8Y",
    authDomain: "lifelink-65c6f.firebaseapp.com",
    projectId: "lifelink-65c6f",
    storageBucket: "lifelink-65c6f.firebasestorage.app",
    messagingSenderId: "770166513894",
    appId: "1:770166513894:web:91f2745cbfae5d978b9b27",
    measurementId: "G-BN34P7N02L"
};


// INITIALIZE FIREBASE
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);


// HTML ELEMENTS
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const authMessage = document.getElementById("authMessage");

const signupBtn = document.getElementById("signupBtn");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");

const helpForm = document.getElementById("helpForm");
const requestList = document.getElementById("requestList");

const chatSection = document.getElementById("chatSection");
const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const closeChatBtn = document.getElementById("closeChatBtn");

const helpRequestsRef = collection(db, "helpRequests");


// VARIABLES
let unsubscribeRequests = null;
let connectedUid = null;
let connectingUid = null;
let connectedNexconnUserId = null;
let selectedTargetId = null;
let selectedTargetName = "User";


// DISPLAY CHAT MESSAGE
function addChatMessage(sender, message) {
    if (!chatMessages) return;

    const messageElement = document.createElement("p");
    messageElement.className = "chat-message";
    messageElement.textContent = sender + ": " + message;

    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}


// GET MESSAGE SENDER ID
function getSenderId(message) {
    return message.senderUserId || null;
}


// GET MESSAGE TEXT
function getMessageText(message) {
    const content = message.content ?? message._content;

    if (typeof content === "string") {
        return content;
    }

    return (
        content?.text ||
        content?.message ||
        message.text ||
        message.message ||
        "New message received"
    );
}


// NEXCONN CONNECTION STATUS
NCEngine.addConnectionStatusHandler(
    "lifelink-connection",
    new ConnectionStatusHandler({
        onConnectionStatusChanged({ status, code }) {
            console.log("Nexconn connection:", status, code);
        }
    })
);


// RECEIVE MESSAGES
NCEngine.addMessageHandler(
    "lifelink-messages",
    new MessageHandler({
        onMessageReceived({ messages }) {
            console.log("Received messages:", messages);

            messages.forEach((message) => {
                console.log("Message details:", message);

                const senderId = getSenderId(message);
                const messageText = getMessageText(message);

                let senderName = "Other User";

                if (senderId === connectedNexconnUserId) {
                    senderName = "You";
                } else if (selectedTargetId && senderId === selectedTargetId) {
                    senderName = selectedTargetName;
                }

                if (chatSection && !chatSection.hidden) {
                    addChatMessage(senderName, String(messageText));
                }
            });
        }
    })
);


// CONNECT NEXCONN
async function connectNexconn(user) {
    if (connectedUid === user.uid || connectingUid === user.uid) {
        return;
    }

    connectingUid = user.uid;

    try {
        const idToken = await user.getIdToken();

        const response = await fetch(
            "http://localhost:3000/api/nexconn-token",
            {
                method: "POST",
                headers: {
                    "Authorization": "Bearer " + idToken,
                    "Content-Type": "application/json"
                }
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Token request failed");
        }

        const nexconnToken = data.result?.accessToken;

        if (!nexconnToken) {
            throw new Error("Nexconn access token missing");
        }

        const result = await NCEngine.connect({
            token: nexconnToken
        });

        if (result.code === 0) {
            connectedUid = user.uid;
            connectedNexconnUserId = result.data?.userId;

            console.log("Firebase UID:", user.uid);
            console.log("Nexconn User ID:", connectedNexconnUserId);

            if (!connectedNexconnUserId) {
                throw new Error("Nexconn User ID missing");
            }
        } else {
            throw new Error("Nexconn connection failed: " + result.code);
        }

    } catch (error) {
        console.error("Nexconn error:", error);
        authMessage.textContent =
            "Login successful, but chat connection failed.";
    } finally {
        connectingUid = null;
    }
}


// OPEN CHAT
function openChat(targetNexconnUserId, targetName) {
    if (!auth.currentUser) {
        alert("Please login first.");
        return;
    }

    if (!connectedUid || !connectedNexconnUserId) {
        alert("Chat is connecting. Please wait.");
        return;
    }

    if (!targetNexconnUserId) {
        alert("Chat ID is missing. Please create a new request or accept it again.");
        return;
    }

    selectedTargetId = targetNexconnUserId;
    selectedTargetName = targetName || "User";

    chatMessages.innerHTML = "";

    const chatTitle = chatSection.querySelector("h2");

    if (chatTitle) {
        chatTitle.textContent = "Chat with " + selectedTargetName;
    }

    chatSection.hidden = false;
    chatInput.focus();

    console.log("Chat target Nexconn ID:", selectedTargetId);
}


// SEND CHAT MESSAGE
chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!selectedTargetId || !connectedUid) {
        alert("Please open a chat first.");
        return;
    }

    const messageText = chatInput.value.trim();

    if (!messageText) return;

    try {
        const channel = new DirectChannel(selectedTargetId);

        const params = new SendTextMessageParams({
            text: messageText
        });

        const { code, data } = await channel.sendMessage(params);

        if (code === 0) {
            addChatMessage("You", messageText);
            chatInput.value = "";

            console.log("Message sent:", data);
        } else {
            alert("Message sending failed. Code: " + code);
            console.error("Send code:", code, data);
        }

    } catch (error) {
        console.error("Send message error:", error);
        alert("Unable to send message.");
    }
});


// CLOSE CHAT
closeChatBtn.addEventListener("click", () => {
    chatSection.hidden = true;
    selectedTargetId = null;
});


// SIGN UP
signupBtn.addEventListener("click", async (event) => {
    event.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    try {
        await createUserWithEmailAndPassword(
            auth,
            email,
            password
        );

        authMessage.textContent = "Account created successfully!";

    } catch (error) {
        authMessage.textContent = error.message;
    }
});


// LOGIN
loginBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    try {
        await signInWithEmailAndPassword(
            auth,
            email,
            password
        );

        authMessage.textContent = "Login successful!";

    } catch (error) {
        authMessage.textContent = error.message;
    }
});


// LOGOUT
logoutBtn.addEventListener("click", async () => {
    try {
        await signOut(auth);

        connectedUid = null;
        connectedNexconnUserId = null;
        selectedTargetId = null;

        chatSection.hidden = true;
        authMessage.textContent = "Logged out successfully!";

    } catch (error) {
        authMessage.textContent = error.message;
    }
});


// DISPLAY HELP REQUESTS
function displayRequests() {
    if (unsubscribeRequests) {
        unsubscribeRequests();
    }

    requestList.innerHTML = "<p>Loading requests...</p>";

    unsubscribeRequests = onSnapshot(
        helpRequestsRef,

        (snapshot) => {
            requestList.innerHTML = "";

            if (snapshot.empty) {
                requestList.innerHTML =
                    "<p>No requests yet. Be the first to post!</p>";
                return;
            }

            snapshot.forEach((documentSnapshot) => {
                const data = documentSnapshot.data();
                const requestId = documentSnapshot.id;

                const card = document.createElement("div");
                card.className = "request-card";

                const heading = document.createElement("h3");
                heading.textContent = data.title || "Help Request";

                const description = document.createElement("p");
                description.textContent = data.description || "";

                const name = document.createElement("small");
                name.textContent =
                    "Posted by: " + (data.name || "User");

                const status = document.createElement("p");
                status.textContent =
                    "Status: " + (data.status || "Pending");

                // ACCEPT BUTTON
                const acceptButton = document.createElement("button");

                if (data.status === "Accepted") {
                    acceptButton.textContent = "Request Accepted";
                    acceptButton.disabled = true;
                } else {
                    acceptButton.textContent = "Accept Help Request";
                }

                acceptButton.addEventListener("click", async () => {
                    if (!auth.currentUser) {
                        alert("Please login first.");
                        return;
                    }

                    if (!connectedNexconnUserId) {
                        alert("Please wait for chat connection.");
                        return;
                    }

                    if (data.userId === auth.currentUser.uid) {
                        alert("You cannot accept your own request.");
                        return;
                    }

                    try {
                        await updateDoc(
                            doc(db, "helpRequests", requestId),
                            {
                                status: "Accepted",
                                acceptedByUid: auth.currentUser.uid,
                                acceptedByNexconnUserId: connectedNexconnUserId
                            }
                        );

                        alert("Request accepted!");

                    } catch (error) {
                        console.error("Accept error:", error);
                        alert("Unable to accept request: " + error.code);
                    }
                });


                // CHAT BUTTON
                const chatButton = document.createElement("button");
                chatButton.textContent = "Chat with User";

                chatButton.addEventListener("click", () => {
                    if (!auth.currentUser) {
                        alert("Please login first.");
                        return;
                    }

                    let targetId;
                    let targetName;

                    if (data.userId === auth.currentUser.uid) {
                        targetId = data.acceptedByNexconnUserId;
                        targetName = "Helper";
                    } else {
                        targetId = data.nexconnUserId;
                        targetName = data.name || "User";
                    }

                    if (data.status !== "Accepted") {
                        alert("Please accept this request first.");
                        return;
                    }

                    if (!targetId) {
                        alert("Chat ID missing. Please create a new request and accept it again.");
                        return;
                    }

                    openChat(targetId, targetName);
                });

                card.appendChild(heading);
                card.appendChild(description);
                card.appendChild(name);
                card.appendChild(document.createElement("br"));
                card.appendChild(acceptButton);
                card.appendChild(chatButton);
                card.appendChild(status);

                requestList.appendChild(card);
            });
        },

        (error) => {
            console.error("Firestore error:", error);
            requestList.textContent =
                "Unable to load requests: " + error.code;
        }
    );
}


// CHECK LOGIN STATUS
onAuthStateChanged(auth, async (user) => {
    if (user) {
        authMessage.textContent = "Logged in: " + user.email;
        logoutBtn.hidden = false;

        displayRequests();

        await connectNexconn(user);

    } else {
        logoutBtn.hidden = true;
        connectedUid = null;
        connectedNexconnUserId = null;
        selectedTargetId = null;

        chatSection.hidden = true;

        if (unsubscribeRequests) {
            unsubscribeRequests();
            unsubscribeRequests = null;
        }

        requestList.innerHTML =
            "<p>Please login to view community requests.</p>";
    }
});


// CREATE HELP REQUEST
helpForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!auth.currentUser) {
        alert("Please login before posting a request.");
        return;
    }

    if (!connectedNexconnUserId) {
        alert("Please wait for chat connection before posting.");
        return;
    }

    const name = document.getElementById("name").value.trim();
    const title = document.getElementById("title").value.trim();
    const description =
        document.getElementById("description").value.trim();

    if (!name || !title || !description) {
        alert("Please fill all fields.");
        return;
    }

    try {
        await addDoc(helpRequestsRef, {
            name: name,
            title: title,
            description: description,
            status: "Pending",
            userId: auth.currentUser.uid,
            nexconnUserId: connectedNexconnUserId,
            createdAt: serverTimestamp()
        });

        helpForm.reset();
        alert("Help request posted successfully!");

    } catch (error) {
        console.error("Post error:", error);
        alert("Unable to post request: " + error.code);
    }
});
