
const queueList = document.getElementById("queue-list");
const peopleCount = document.getElementById("people-count");

let queue = [];


// Get the latest queue from the backend
async function loadQueue() {
    try {
        const response = await fetch("/api/queue/details");

        if (!response.ok) {
            throw new Error("Could not load queue");
        }

       const data = await response.json();
queue = data.queue;
updateQueue();
    } catch (error) {
        console.error("Error loading queue:", error);
        alert("Could not load the queue. Check if the backend is running.");
    }
}

// Display the queue
function updateQueue() {
    queueList.innerHTML = "";

    queue.forEach((person, index) => {
        const personDiv = document.createElement("div");
        personDiv.className = "person";

        if (index === 0) {
            personDiv.classList.add("active");
        }

        const info = document.createElement("div");
        info.className = "person-info";

        const position = document.createElement("span");
        position.className = "position";
        position.textContent = String(index + 1).padStart(2, "0");

        const details = document.createElement("div");

        const name = document.createElement("h4");
        name.textContent = person.name;

     
const wait = document.createElement("p");

const estimatedWait = person.estimatedWait ?? 0;

wait.textContent =
    "Estimated wait: " + estimatedWait + " min";


        details.append(name, wait);
        info.append(position, details);
        personDiv.appendChild(info);

        if (index === 0 || index === 1) {
            const status = document.createElement("span");
            status.className = "status";

            if (index === 0) {
                status.classList.add("active-status");
                status.textContent = "ACTIVE";
            } else {
                status.classList.add("next-status");
                status.textContent = "NEXT";
            }

            personDiv.appendChild(status);
        }

        queueList.appendChild(personDiv);
    });

    peopleCount.textContent = queue.length;
}

// Send a request to the backend
async function sendRequest(url, method, data = null) {
    const options = {
        method: method,
        headers: {
            "Content-Type": "application/json"
        }
    };

    if (data !== null) {
        options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.message || "Something went wrong");
    }

    return result;
}

// ADD: Add a person to the backend queue
document.querySelector(".add").addEventListener("click", async function() {
    const name = prompt("Enter the person's name:");

    if (!name || !name.trim()) {
        return;
    }

    try {
        await sendRequest("/api/queue", "POST", {
            name: name.trim()
        });

        await loadQueue();
    } catch (error) {
        alert(error.message);
    }
});

// REMOVE: Remove a person by queue position
document.querySelector(".remove").addEventListener("click", async function() {
    if (queue.length === 0) {
        alert("The queue is empty!");
        return;
    }

    const position = prompt(
        "Enter the position to remove (1 to " + queue.length + "):"
    );

    if (position === null || position.trim() === "") {
        return;
    }

    const index = Number(position) - 1;

    if (
        !Number.isInteger(Number(position)) ||
        index < 0 ||
        index >= queue.length
    ) {
        alert("Please enter a valid queue position.");
        return;
    }

    const person = queue[index];

    try {
        const result = await sendRequest(
            "/api/queue/" + person.id,
            "DELETE"
        );

        alert(result.message);
        await loadQueue();
    } catch (error) {
        alert(error.message);
    }
});

// SKIP: Move the first person to the end
document.querySelector(".skip").addEventListener("click", async function() {
    if (queue.length < 2) {
        alert("Not enough people to skip!");
        return;
    }

    try {
        const result = await sendRequest("/api/queue/skip", "POST");
        alert(result.message);
        await loadQueue();
    } catch (error) {
        alert(error.message);
    }
});

// NEXT: Finish the first person's turn
document.querySelector(".next").addEventListener("click", async function() {
    if (queue.length === 0) {
        alert("The queue is empty!");
        return;
    }

    try {
        const result = await sendRequest("/api/queue/next", "POST");
        alert(result.message);
        await loadQueue();
    } catch (error) {
        alert(error.message);
    }
});

// QR code functionality — kept from your original code
const refreshQR = document.getElementById("refresh-qr");
const qrBox = document.getElementById("qr-box");

function generateQR() {
    if (typeof QRCode === "undefined") {
        alert("QR library not loaded. Check your internet connection.");
        return;
    }

    qrBox.innerHTML = "";

   const joinURL = "http://192.168.29.135:3000/join.html";

    new QRCode(qrBox, {
        text: joinURL,
        width: 180,
        height: 180,
        correctLevel: QRCode.CorrectLevel.H
    });
}

refreshQR.addEventListener("click", generateQR);

// Initial setup
generateQR();

setInterval(loadQueue, 3000);

async function manageQueue(action) {
    try {
        const response = await fetch("/api/queue/" + action, {
            method: "POST"
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || "Action failed");
        }

        alert(result.message);
        await updateQueueStatus();

    } catch (error) {
        alert(error.message);
    }
}

document.getElementById("pause-queue").addEventListener("click", () => {
    manageQueue("pause");
});

document.getElementById("resume-queue").addEventListener("click", () => {
    manageQueue("resume");
});

document.getElementById("close-queue").addEventListener("click", () => {
    manageQueue("close");
});

document.getElementById("reopen-queue").addEventListener("click", () => {
    manageQueue("reopen");
});


const queueStatus = document.getElementById("queue-status");

async function updateQueueStatus() {
    try {
        const response = await fetch("/api/queue/status");

        if (!response.ok) {
            throw new Error("Could not get queue status");
        }

        const data = await response.json();

        queueStatus.textContent =
            data.status.charAt(0).toUpperCase() + data.status.slice(1);

        queueStatus.className = data.status;

    } catch (error) {
        queueStatus.textContent = "Unavailable";
        console.error(error);
    }
}

// Show the status when the dashboard opens
updateQueueStatus();
loadQueue();
