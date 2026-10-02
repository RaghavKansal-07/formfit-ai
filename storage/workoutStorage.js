const STORAGE_KEY = "formfit-workout-history";

function readHistory() {
    const storedData = localStorage.getItem(STORAGE_KEY);

    if (!storedData) {
        return [];
    }

    try {
        return JSON.parse(storedData);
    } catch (error) {
        console.error("Unable to read workout history:", error);
        return [];
    }
}

function writeHistory(history) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

// CREATE
export function saveWorkout(workout) {
    const history = readHistory();

    const newWorkout = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...workout
    };

    history.push(newWorkout);
    writeHistory(history);

    return newWorkout;
}

// READ
export function getWorkouts() {
    return readHistory();
}

// READ ONE
export function getWorkoutById(id) {
    const history = readHistory();

    return history.find((workout) => workout.id === id) || null;
}

// UPDATE
export function updateWorkout(id, updates) {
    const history = readHistory();
    const index = history.findIndex((workout) => workout.id === id);

    if (index === -1) {
        return null;
    }

    history[index] = {
        ...history[index],
        ...updates,
        id: history[index].id,
        createdAt: history[index].createdAt,
        updatedAt: new Date().toISOString()
    };

    writeHistory(history);

    return history[index];
}

// DELETE
export function deleteWorkout(id) {
    const history = readHistory();
    const updatedHistory = history.filter((workout) => workout.id !== id);

    if (updatedHistory.length === history.length) {
        return false;
    }

    writeHistory(updatedHistory);

    return true;
}