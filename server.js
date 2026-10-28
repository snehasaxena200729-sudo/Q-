
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;
const historyFile = path.join(__dirname, "data", "queue-history.json");
function loadHistory() {
    try {
        const data = fs.readFileSync(historyFile, "utf8");
        return JSON.parse(data);
    } catch (error) {
        console.error("Could not load queue history:", error.message);
        return [];
    }
}

let queueHistory = loadHistory();
function saveHistory(event) {
    const now = new Date();

    const record = {
        ...event,
        timestamp: now.toISOString(),
        hour: now.getHours(),
        dayOfWeek: now.getDay()
    };

    queueHistory.push(record);

    fs.writeFileSync(
        historyFile,
        JSON.stringify(queueHistory, null, 2)
    );
}

app.use(express.json());
app.use(express.static(__dirname));

// Temporary queue data
let queue = [];
let nextId = 1;
let isPaused = false;
let isClosed = false;

let averageServiceTime = 5; // Initial estimate in minutes
let completedServiceTimes = [];
let currentServiceStartedAt = null;


function getEstimatedWait(positionIndex) {
    if (queue.length === 0) {
        return 0;
    }

    // Estimate the remaining time for the current customer
    let remainingTime = 0;

    if (currentServiceStartedAt !== null) {
        const elapsedMinutes =
            (Date.now() - currentServiceStartedAt) / 60000;

        remainingTime = Math.max(
            0,
            averageServiceTime - elapsedMinutes
        );
    }

    // Add expected service time for people waiting ahead
    const wait =
        remainingTime + positionIndex * averageServiceTime;

    return Math.max(0, Math.ceil(wait));
}


// Test route
app.get("/", (req, res) => {
    res.send("Q backend is running!");
});


// API 1: Get everyone in the queue

app.get("/api/queue", (req, res) => {
    const updatedQueue = queue.map((person, index) => ({
        ...person,
        position: index + 1,
        peopleAhead: index,
        estimatedWait: getEstimatedWait(index)
    }));

    res.json(updatedQueue);
});

// API: Get queue summary — ADD THIS HERE
app.get("/api/queue/summary", (req, res) => {
    res.json({
        totalPeople: queue.length,
        waitingPeople: queue.filter(
            person => person.status === "waiting"
        ).length,
        averageServiceTime: Math.round(
            averageServiceTime * 100
        ) / 100,
        isPaused: isPaused,
        isClosed: isClosed
    });
});

app.get("/api/queue/prediction/:personId", (req, res) => {
    const personId = Number(req.params.personId);

    const index = queue.findIndex(
        person => person.id === personId
    );

    if (index === -1) {
        return res.status(404).json({
            message: "Customer not found in the queue."
        });
    }

    res.json({
        personId: personId,
        position: index + 1,
        peopleAhead: index,
        estimatedWaitMinutes: getEstimatedWait(index),
        predictionType: "average_service_time"
    });
});

app.get("/api/history/completed", (req, res) => {
    const completedServices = queueHistory.filter(
        event =>
            event.type === "service_completed" &&
            typeof event.serviceDurationMinutes === "number"
    );

    res.json({
        totalRecords: completedServices.length,
        records: completedServices
    });
});

app.get("/api/history/stats", (req, res) => {
    const completedServices = queueHistory.filter(
        event =>
            event.type === "service_completed" &&
            typeof event.serviceDurationMinutes === "number" &&
            event.serviceDurationMinutes > 0
    );

    const totalRecords = completedServices.length;

    const averageDuration = totalRecords > 0
        ? completedServices.reduce(
            (sum, event) => sum + event.serviceDurationMinutes,
            0
        ) / totalRecords
        : 0;

    res.json({
        totalCompletedServices: totalRecords,
        averageServiceDurationMinutes:
            Math.round(averageDuration * 100) / 100,
        readyForMLExperiment: totalRecords >= 30
    });
});

app.get("/api/queue/health", (req, res) => {
    res.json({
        status: isClosed
            ? "closed"
            : isPaused
                ? "paused"
                : queue.length === 0
                    ? "empty"
                    : "active",
        queueLength: queue.length,
        serverTime: new Date().toISOString()
    });
});



 // API 2: Add a person to the queue
app.post("/api/queue", (req, res) => {
    const { name } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({
            message: "Please enter a name"
        });
    }

    if (isPaused) {
        return res.status(400).json({
            message: "Queue is paused. Please try again later!"
        });
    }

    if (isClosed) {
        return res.status(400).json({
            message: "Queue is closed. Please try again later!"
        });
    }

const person = {
    id: nextId++,
    name: name.trim(),
    status: "waiting",
    joinedAt: Date.now()
};

   
const wasEmpty = queue.length === 0;

queue.push(person);
saveHistory({
    type: "join",
    personId: person.id,
    joinedAt: person.joinedAt,
    queueLength: queue.length
});


if (wasEmpty) {
    currentServiceStartedAt = Date.now();

    saveHistory({
        type: "service_started",
        personId: person.id,
        actualWaitMinutes: 0,
        queueLength: queue.length
    });
}


const position = queue.length;
const estimatedWait = getEstimatedWait(position - 1);


    res.status(201).json({
        message: "Successfully joined the queue!",
        person: person,
        queueNumber: person.id,
        position: position,
        peopleAhead: position - 1,
        estimatedWait: estimatedWait
    });
});




app.post("/api/queue/next", (req, res) => {
    if (isPaused || isClosed) {
        return res.status(400).json({
            message: "Queue is paused or closed!"
        });
    }
    if (queue.length === 0) {
        return res.status(400).json({
            message: "The queue is empty!"
        });
    }

   
const servedPerson = queue[0];


// Record how long the service took

if (currentServiceStartedAt !== null) {
    const duration =
        (Date.now() - currentServiceStartedAt) / 60000;

   
saveHistory({
    type: "service_completed",
    personId: servedPerson.id,
    serviceStartedAt: currentServiceStartedAt,
    serviceDurationMinutes: Math.round(duration * 100) / 100,
    queueLength: queue.length,
    averageServiceTimeAtCompletion: Math.round(
        averageServiceTime * 100
    ) / 100
});


    // Ignore zero-length or unusually long sessions
    if (duration >= 0.1 && duration <= 180) {
        completedServiceTimes.push(duration);

        if (completedServiceTimes.length > 10) {
            completedServiceTimes.shift();
        }

        averageServiceTime =
            completedServiceTimes.reduce((sum, time) => sum + time, 0) /
            completedServiceTimes.length;
    }
}

queue.shift();


// Start timing the next person
currentServiceStartedAt =
    queue.length > 0 ? Date.now() : null;

// Record when the next customer's service starts
if (queue.length > 0) {
    const nextPerson = queue[0];

    if (nextPerson.joinedAt) {
        const actualWait =
            (Date.now() - nextPerson.joinedAt) / 60000;

        saveHistory({
            type: "service_started",
            personId: nextPerson.id,
            actualWaitMinutes: Math.round(actualWait * 100) / 100,
            queueLength: queue.length
        });
    }
}


    res.json({
        message: servedPerson.name + " has been served!",
        person: servedPerson,
        queue: queue
    });
});


app.post("/api/queue/skip", (req, res) => {
    if (isPaused || isClosed) {
        return res.status(400).json({
            message: "Queue is paused or closed!"
        });
    }
    if (queue.length === 0) {
        return res.status(400).json({
            message: "The queue is empty!"
        });
    }

    const skippedPerson = queue.shift();

    queue.push(skippedPerson);

    res.json({
        message: skippedPerson.name + " moved to the end of the queue!",
        person: skippedPerson,
        queue: queue
    });
});

app.delete("/api/queue/:id", (req, res) => {
    const id = Number(req.params.id);

    const index = queue.findIndex(person => person.id === id);

    if (index === -1) {
        return res.status(404).json({
            message: "Person not found in the queue!"
        });
    }

    const removedPerson = queue.splice(index, 1);

    res.json({
        message: removedPerson[0].name + " has been removed!",
        person: removedPerson[0],
        queue: queue
    });
});


app.post("/api/queue/pause", (req, res) => {
    isPaused = true;

    res.json({
        message: "Queue paused!",
        isPaused: isPaused
    });
});

app.post("/api/queue/resume", (req, res) => {
    isPaused = false;

    res.json({
        message: "Queue resumed!",
        isPaused: isPaused
    });
});

app.post("/api/queue/close", (req, res) => {
    isClosed = true;

    res.json({
        message: "Queue closed!",
        isClosed: isClosed
    });
});

app.post("/api/queue/reopen", (req, res) => {
    isClosed = false;

    res.json({
        message: "Queue reopened!",
        isClosed: isClosed
    });
});

app.get("/api/queue/status", (req, res) => {
    let status = "open";

    if (isClosed) {
        status = "closed";
    } else if (isPaused) {
        status = "paused";
    }

    res.json({
        status: status,
        peopleWaiting: queue.length
    });
});


app.get("/api/queue/details", (req, res) => {
    const queueDetails = queue.map((person, index) => ({
        ...person,
        position: index + 1,
        estimatedWait: getEstimatedWait(index)
    }));

    res.json({
        totalPeople: queue.length,
        averageServiceTime: Number(averageServiceTime.toFixed(1)),
        queue: queueDetails
    });
});




// Start server
app.listen(PORT, () => {
    console.log(`Q backend is running at http://localhost:${PORT}`);
});
