import express, { Request, Response, Router } from "express";
import { existsSync, readFileSync, writeFileSync, watch, FSWatcher } from "fs";
import path from "path";

// Extend the Router type to include our cleanup method
interface SourcesRouter extends Router {
  cleanup: () => void;
  reset: () => Promise<void>;
}

const router = express.Router() as SourcesRouter;

// Optional configuration: external file for storing sources
const getSourcesFilePath = () => process.env.SOURCES_FILE_PATH || "";

// Store the file watcher instance
let fileWatcher: FSWatcher | null = null;

// Initialize sources array
let sources: Array<any> = [];

// Function to load sources from the external file if provided
function loadSources(): Array<any> {
  const sourcesFilePath = getSourcesFilePath();
  console.log("Loading sources from:", sourcesFilePath);
  console.log("File exists:", sourcesFilePath && existsSync(sourcesFilePath));

  if (!sourcesFilePath || !existsSync(sourcesFilePath)) {
    console.log("No sources file found, returning empty array");
    sources = [];
    return sources;
  }

  try {
    const data = readFileSync(sourcesFilePath, "utf-8");
    console.log("Read file contents:", data);
    const parsedSources = JSON.parse(data);
    sources = Array.isArray(parsedSources) ? parsedSources : [];
    console.log("Loaded sources:", sources);
  } catch (error) {
    console.error("Error parsing sources file:", error);
    sources = [];
  }

  return sources;
}

// Function to save sources to the external file if provided
function saveSources(newSources: any[]): void {
  const sourcesFilePath = getSourcesFilePath();
  console.log("Saving sources:", newSources);
  console.log("To file:", sourcesFilePath);

  sources = [...newSources];

  if (!sourcesFilePath) {
    console.log("No sources file path set, skipping save");
    return;
  }

  try {
    writeFileSync(sourcesFilePath, JSON.stringify(sources, null, 2), "utf-8");
    console.log("Successfully wrote to file");
  } catch (error) {
    console.error("Error writing to sources file:", error);
  }
}

// Function to setup file watching
function setupFileWatcher() {
  const sourcesFilePath = getSourcesFilePath();
  console.log("Setting up file watcher for:", sourcesFilePath);

  if (!sourcesFilePath || fileWatcher) {
    console.log(
      "Skipping file watcher setup:",
      !sourcesFilePath ? "no file path" : "watcher exists"
    );
    return;
  }

  try {
    fileWatcher = watch(sourcesFilePath, (eventType, filename) => {
      console.log("File change detected:", eventType, filename);
      if (eventType === "change") {
        console.log(
          `Sources file changed. Reloading sources from ${sourcesFilePath}.`
        );
        loadSources();
      }
    });
    // Ensure the watcher is properly cleaned up
    fileWatcher.unref();
    console.log("File watcher setup complete");
  } catch (error) {
    console.error("Error setting up file watcher:", error);
  }
}

// Function to cleanup file watching
function cleanupFileWatcher() {
  console.log("Cleaning up file watcher");

  if (!fileWatcher) {
    console.log("No file watcher to clean up");
    return;
  }

  try {
    fileWatcher.close();
    console.log("File watcher closed");
  } catch (error) {
    console.error("Error closing file watcher:", error);
  }
  fileWatcher = null;
}

// Function to reset the state (for testing)
async function resetState(): Promise<void> {
  console.log("Resetting state");
  cleanupFileWatcher();
  sources = loadSources();
  setupFileWatcher();
  console.log("Reset complete, current sources:", sources);
}

// GET /sources: Retrieve all sources
router.get("/", (req: Request, res: Response) => {
  res.json(sources);
});

// POST /sources: Add a new source
router.post("/", (req: Request, res: Response) => {
  const newSource = req.body;
  if (!newSource.id) {
    res.status(400).json({ message: "Source must have an id" });
    return;
  }
  const newSources = [...sources, newSource];
  saveSources(newSources);
  res.status(201).json({ message: "Source added", source: newSource });
});

// PUT /sources/:id: Update an existing source
router.put("/:id", (req: Request, res: Response) => {
  const { id } = req.params;
  const updatedSource = req.body;
  const index = sources.findIndex((src) => src.id === id);
  if (index === -1) {
    res.status(404).json({ message: "Source not found" });
    return;
  }
  const newSources = [...sources];
  newSources[index] = { ...sources[index], ...updatedSource };
  saveSources(newSources);
  res.json({ message: "Source updated", source: newSources[index] });
});

// DELETE /sources/:id: Remove a source
router.delete("/:id", (req: Request, res: Response) => {
  const { id } = req.params;
  const index = sources.findIndex((src) => src.id === id);
  if (index === -1) {
    res.status(404).json({ message: "Source not found" });
    return;
  }
  const newSources = [...sources];
  const [removed] = newSources.splice(index, 1);
  saveSources(newSources);
  res.json({ message: "Source removed", source: removed });
});

// Cleanup function for the router
router.cleanup = cleanupFileWatcher;
router.reset = resetState;

// Initial setup
setupFileWatcher();
loadSources();

export default router;
