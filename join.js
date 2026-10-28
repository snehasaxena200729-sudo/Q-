
const nameInput = document.getElementById("name");
const joinButton = document.getElementById("join-btn");
let customerQueueId = null;
let ticketRefreshInterval = null;

joinButton.addEventListener("click", async function() {
    const name = nameInput.value.trim();

    if (name === "") {
        alert("Please enter your name!");
        return;
    }

    try {
        const response = await fetch("/api/queue", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name: name
            })
        });

        const result = await response.json();

        if (!response.ok) {
            alert(result.message || "Could not join the queue.");
            return;
        }

       // Hide the form after joining
nameInput.disabled = true;
joinButton.disabled = true;


    // Show the customer's ticket
    customerQueueId = result.person.id;
    document.getElementById("ticket").style.display = "block";

    document.getElementById("ticket-name").textContent =
        result.person.name;

    document.getElementById("ticket-number").textContent =
        "#" + result.queueNumber;

    document.getElementById("people-ahead").textContent =
        result.peopleAhead;

    document.getElementById("wait-time").textContent =
        result.estimatedWait;


    } catch (error) {
        alert("Could not connect to the server. Please try again.");
        console.error(error);
    }
});
const queueStatus = document.getElementById("queue-status");


async function checkQueueStatus() {
    try {
        const response = await fetch("/api/queue/status");
        const data = await response.json();

        queueStatus.textContent =
            data.status === "open"
                ? "Queue is Open"
                : data.status === "paused"
                ? "Queue is Paused"
                : "Queue is Closed";

        joinButton.disabled = data.status !== "open";
    } catch (error) {
        queueStatus.textContent = "Unable to check queue status";
        joinButton.disabled = true;
    }
}

checkQueueStatus();
setInterval(checkQueueStatus, 3000);

async function updateCustomerTicket() {
    if (customerQueueId === null) {
        return;
    }

    try {
        const response = await fetch("/api/queue/details");

        if (!response.ok) {
            throw new Error("Could not update ticket");
        }

        const data = await response.json();

        const person = data.queue.find(
            person => person.id === customerQueueId
        );

        if (!person) {
            document.getElementById("ticket-status").textContent =
                "Your turn has been completed or your ticket was removed.";
            return;
        }

        document.getElementById("ticket-position").textContent =
            person.position;

        document.getElementById("people-ahead").textContent =
            person.position - 1;

        document.getElementById("wait-time").textContent =
            person.estimatedWait;

     
const ticket = document.getElementById("ticket");
const ticketStatus = document.getElementById("ticket-status");

// Check whether the customer is next
if (person.position === 1) {
    ticket.classList.add("your-turn");
    ticketStatus.classList.add("your-turn-message");
    ticketStatus.textContent = "🎉 You're next! Please be ready.";

    // Notify only when the customer first reaches position 1
    if (!ticket.dataset.notified) {
        alert("🎉 You're next! Please be ready for your turn.");
        ticket.dataset.notified = "true";
    }
} else {
    ticket.classList.remove("your-turn");
    ticketStatus.classList.remove("your-turn-message");
    ticketStatus.textContent =
        "You're in the queue. We'll keep you updated.";

    // Allow another notification if they reach position 1 again
    ticket.dataset.notified = "";
}

    } catch (error) {
        console.error("Ticket update failed:", error);
    }
}
updateCustomerTicket();

if (ticketRefreshInterval !== null) {
    clearInterval(ticketRefreshInterval);
}

ticketRefreshInterval = setInterval(
    updateCustomerTicket,
    3000
);
document.getElementById("leave-queue").addEventListener("click", async () => {
    if (customerQueueId === null) {
        return;
    }

    const confirmed = confirm("Are you sure you want to leave the queue?");

    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch("/api/queue/" + customerQueueId, {
            method: "DELETE"
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || "Could not leave the queue");
        }

        if (ticketRefreshInterval !== null) {
            clearInterval(ticketRefreshInterval);
        }

        document.getElementById("ticket-status").textContent =
            "You have left the queue.";

        document.getElementById("leave-queue").style.display = "none";

        alert("You have successfully left the queue.");

    } catch (error) {
        alert(error.message);
    }
});